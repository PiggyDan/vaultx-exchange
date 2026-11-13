import { handle, rateLimit, readJson } from "@/lib/server/http";
import { requireSession } from "@/lib/server/session";
import { orderInput, placeOrder } from "@/lib/server/trading";

export async function POST(req: Request) {
  return handle(req, async () => {
    const { userId } = await requireSession();
    rateLimit(`order:${userId}`, 30, 60_000);
    const input = orderInput.parse(await readJson(req));
    const order = await placeOrder(userId, input);
    return Response.json(
      {
        order: {
          id: order.id,
          status: order.status,
          side: order.side,
          type: order.type,
          base: order.base,
          amount: order.amount.toNumber(),
          price: order.price?.toNumber() ?? null,
          fillPrice: order.fillPrice?.toNumber() ?? null,
        },
      },
      { status: 201 },
    );
  });
}
