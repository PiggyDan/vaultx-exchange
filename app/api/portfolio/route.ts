import { handle } from "@/lib/server/http";
import { destroySession, getSession } from "@/lib/server/session";
import { getPortfolio } from "@/lib/server/trading";

/** Current user's balances, open orders and recent history. `{ user: null }` when logged out. */
export async function GET(req: Request) {
  return handle(req, async () => {
    const session = await getSession();
    if (!session) return Response.json({ user: null });
    const portfolio = await getPortfolio(session.userId);
    if (!portfolio) {
      await destroySession(); // token for a deleted user
      return Response.json({ user: null });
    }
    return Response.json(portfolio);
  });
}
