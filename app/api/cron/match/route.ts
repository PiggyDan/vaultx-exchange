import { ApiError, handle } from "@/lib/server/http";
import { matchOpenOrders } from "@/lib/server/trading";

/** Scheduled sweep (vercel.json) that fills resting limit orders even if their owners are offline. */
export async function GET(req: Request) {
  return handle(req, async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError(401, "Unauthorized");
    const filled = await matchOpenOrders();
    return Response.json({ filled });
  });
}
