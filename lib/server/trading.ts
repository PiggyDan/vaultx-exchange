import { Prisma, type Order } from "@prisma/client";
import { z } from "zod";
import { PAIRS, QUOTE, START_QUOTE_BALANCE } from "@/lib/pairs";
import { db } from "./db";
import { ApiError } from "./http";
import { getCandlesSince, getPrices } from "./market";
import { executionPrice, isMarketable, rangeSince, shouldFillResting, withinBand } from "./matching";

const D = Prisma.Decimal;
type Tx = Prisma.TransactionClient;
const MIN_NOTIONAL = 1; // USDT

export const orderInput = z.object({
  symbol: z.string().refine((s) => PAIRS.some((p) => p.symbol === s), "Unsupported trading pair"),
  side: z.enum(["BUY", "SELL"]),
  type: z.enum(["MARKET", "LIMIT"]),
  amount: z.string().regex(/^\d+(\.\d+)?$/, "Amount must be a positive number"),
  price: z
    .string()
    .regex(/^\d+(\.\d+)?$/, "Price must be a positive number")
    .optional(),
});
export type OrderInput = z.infer<typeof orderInput>;

// ─── Balance primitives (all run inside a transaction) ───────────────────────

async function credit(tx: Tx, userId: string, asset: string, qty: Prisma.Decimal) {
  await tx.balance.upsert({
    where: { userId_asset: { userId, asset } },
    create: { userId, asset, free: qty },
    update: { free: { increment: qty } },
  });
}

/** Atomically debit `free` (optionally moving it to `locked`); fails instead of going negative. */
async function debit(tx: Tx, userId: string, asset: string, qty: Prisma.Decimal, lock: boolean) {
  const { count } = await tx.balance.updateMany({
    where: { userId, asset, free: { gte: qty } },
    data: { free: { decrement: qty }, ...(lock ? { locked: { increment: qty } } : {}) },
  });
  if (count === 0) throw new ApiError(400, `Insufficient ${asset} balance`);
}

async function unlock(tx: Tx, userId: string, asset: string, qty: Prisma.Decimal, toFree: boolean) {
  await tx.balance.update({
    where: { userId_asset: { userId, asset } },
    data: { locked: { decrement: qty }, ...(toFree ? { free: { increment: qty } } : {}) },
  });
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export async function createAccount(username: string, passwordHash: string) {
  try {
    return await db.user.create({
      data: { username, passwordHash, balances: { create: { asset: QUOTE, free: new D(START_QUOTE_BALANCE) } } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "That username is taken");
    }
    throw e;
  }
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export async function placeOrder(userId: string, input: OrderInput) {
  const pair = PAIRS.find((p) => p.symbol === input.symbol)!;
  const amount = new D(input.amount).toDecimalPlaces(pair.amountDecimals, D.ROUND_DOWN);
  if (amount.lte(0)) throw new ApiError(400, "Amount is too small");

  const market = (await getPrices())[pair.symbol];
  if (!market) throw new ApiError(503, "No market price available");

  let limit: Prisma.Decimal | null = null;
  if (input.type === "LIMIT") {
    if (!input.price) throw new ApiError(400, "Limit orders need a price");
    limit = new D(input.price).toDecimalPlaces(pair.priceDecimals);
    if (limit.lte(0)) throw new ApiError(400, "Price must be greater than zero");
    if (!withinBand(limit.toNumber(), market)) throw new ApiError(400, "Limit price must be within 50% of the market price");
  }

  const marketable = input.type === "MARKET" || isMarketable(input.side, limit!.toNumber(), market);
  const fill = marketable
    ? new D(executionPrice(input.type, input.side, limit?.toNumber() ?? null, market)).toDecimalPlaces(pair.priceDecimals)
    : null;
  const refPrice = (fill ?? limit)!;
  const notional = amount.mul(refPrice);
  if (notional.lt(MIN_NOTIONAL)) throw new ApiError(400, `Minimum order size is ${MIN_NOTIONAL} ${QUOTE}`);

  return db.$transaction(async (tx) => {
    if (input.side === "BUY") {
      await debit(tx, userId, pair.quote, notional, !marketable);
      if (marketable) await credit(tx, userId, pair.base, amount);
    } else {
      await debit(tx, userId, pair.base, amount, !marketable);
      if (marketable) await credit(tx, userId, pair.quote, notional);
    }
    return tx.order.create({
      data: {
        userId,
        symbol: pair.symbol,
        base: pair.base,
        quote: pair.quote,
        side: input.side,
        type: input.type,
        price: limit,
        amount,
        status: marketable ? "FILLED" : "OPEN",
        fillPrice: fill,
        filledAt: marketable ? new Date() : null,
      },
    });
  });
}

export async function cancelOrder(userId: string, orderId: string) {
  return db.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new ApiError(404, "Order not found");
    // Conditional status flip guards against racing a concurrent fill.
    const { count } = await tx.order.updateMany({ where: { id: orderId, status: "OPEN" }, data: { status: "CANCELLED" } });
    if (count === 0) throw new ApiError(409, "Order is no longer open");
    if (order.side === "BUY") await unlock(tx, userId, order.quote, order.amount.mul(order.price!), true);
    else await unlock(tx, userId, order.base, order.amount, true);
    return { ...order, status: "CANCELLED" as const };
  });
}

async function fillResting(order: Order) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: order.id, status: "OPEN" },
      data: { status: "FILLED", fillPrice: order.price, filledAt: new Date() },
    });
    if (count === 0) return; // already filled/cancelled by another request
    const cost = order.amount.mul(order.price!);
    if (order.side === "BUY") {
      await unlock(tx, order.userId, order.quote, cost, false);
      await credit(tx, order.userId, order.base, order.amount);
    } else {
      await unlock(tx, order.userId, order.base, order.amount, false);
      await credit(tx, order.userId, order.quote, cost);
    }
  });
}

/**
 * Lazy matching engine: fills open limit orders whose price was traded through since they were
 * placed. Runs on portfolio/leaderboard reads and from a scheduled cron job.
 */
export async function matchOpenOrders(userId?: string) {
  const open = await db.order.findMany({
    where: { status: "OPEN", type: "LIMIT", ...(userId ? { userId } : {}) },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  if (open.length === 0) return 0;

  const prices = await getPrices().catch(() => ({}) as Record<string, number>);
  const bySymbol = new Map<string, Order[]>();
  for (const o of open) bySymbol.set(o.symbol, [...(bySymbol.get(o.symbol) ?? []), o]);

  let filled = 0;
  for (const [symbol, orders] of bySymbol) {
    const candles = await getCandlesSince(symbol, orders[0].createdAt)
      .then((r) => r.candles)
      .catch(() => []);
    for (const o of orders) {
      const range = rangeSince(candles, o.createdAt.getTime(), prices[symbol]);
      if (shouldFillResting(o.side, o.price!.toNumber(), range)) {
        await fillResting(o);
        filled++;
      }
    }
  }
  return filled;
}

// ─── Read models ─────────────────────────────────────────────────────────────

const orderView = (o: Order) => ({
  id: o.id,
  symbol: o.symbol,
  base: o.base,
  quote: o.quote,
  side: o.side,
  type: o.type,
  price: o.price?.toNumber() ?? null,
  amount: o.amount.toNumber(),
  fillPrice: o.fillPrice?.toNumber() ?? null,
  status: o.status,
  createdAt: o.createdAt.toISOString(),
  filledAt: o.filledAt?.toISOString() ?? null,
});
export type OrderView = ReturnType<typeof orderView>;

export function valueUsd(balances: { asset: string; free: Prisma.Decimal; locked: Prisma.Decimal }[], prices: Record<string, number>) {
  return balances.reduce((sum, b) => {
    const qty = b.free.add(b.locked).toNumber();
    if (b.asset === QUOTE) return sum + qty;
    const pair = PAIRS.find((p) => p.base === b.asset);
    return sum + qty * (pair ? (prices[pair.symbol] ?? 0) : 0);
  }, 0);
}

export async function getPortfolio(userId: string) {
  await matchOpenOrders(userId).catch((e) => console.error("matching failed", e));
  const [user, balances, openOrders, history, prices] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, username: true, createdAt: true } }),
    db.balance.findMany({ where: { userId } }),
    db.order.findMany({ where: { userId, status: "OPEN" }, orderBy: { createdAt: "desc" } }),
    db.order.findMany({ where: { userId, status: { not: "OPEN" } }, orderBy: { createdAt: "desc" }, take: 30 }),
    getPrices().catch(() => null),
  ]);
  if (!user) return null;
  return {
    user,
    balances: Object.fromEntries(balances.map((b) => [b.asset, { free: b.free.toNumber(), locked: b.locked.toNumber() }])),
    openOrders: openOrders.map(orderView),
    history: history.map(orderView),
    totalValueUsd: prices ? valueUsd(balances, prices) : null,
    startingValueUsd: START_QUOTE_BALANCE,
  };
}

export async function getLeaderboard(limit = 20) {
  await matchOpenOrders().catch((e) => console.error("matching failed", e));
  const [users, prices] = await Promise.all([
    db.user.findMany({
      take: 1000,
      select: { username: true, createdAt: true, balances: true, _count: { select: { orders: { where: { status: "FILLED" } } } } },
    }),
    getPrices(),
  ]);
  return users
    .map((u) => {
      const value = valueUsd(u.balances, prices);
      return {
        username: u.username,
        valueUsd: value,
        pnlPct: ((value - START_QUOTE_BALANCE) / START_QUOTE_BALANCE) * 100,
        trades: u._count.orders,
        joined: u.createdAt.toISOString(),
      };
    })
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, limit)
    .map((row, i) => ({ rank: i + 1, ...row }));
}
