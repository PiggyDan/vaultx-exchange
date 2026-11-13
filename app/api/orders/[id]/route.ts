import { handle } from "@/lib/server/http";
import { requireSession } from "@/lib/server/session";
import { cancelOrder } from "@/lib/server/trading";

export async function DELETE(req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  return handle(req, async () => {
    const { userId } = await requireSession();
    const { id } = await ctx.params;
    const order = await cancelOrder(userId, id);
    return Response.json({ order: { id: order.id, status: order.status } });
  });
}
