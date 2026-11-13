import { handle } from "@/lib/server/http";
import { getLeaderboard } from "@/lib/server/trading";

export async function GET(req: Request) {
  return handle(req, async () => {
    // Touch the request so this always renders at request time.
    void req.headers;
    return Response.json({ leaders: await getLeaderboard(20) });
  });
}
