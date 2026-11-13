import { handle } from "@/lib/server/http";
import { destroySession } from "@/lib/server/session";

export async function POST(req: Request) {
  return handle(req, async () => {
    await destroySession();
    return Response.json({ ok: true });
  });
}
