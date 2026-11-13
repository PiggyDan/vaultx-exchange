import { credentials, hashPassword } from "@/lib/server/auth";
import { clientIp, handle, rateLimit, readJson } from "@/lib/server/http";
import { createSession } from "@/lib/server/session";
import { createAccount } from "@/lib/server/trading";

export async function POST(req: Request) {
  return handle(req, async () => {
    rateLimit(`register:${clientIp(req)}`, 5, 60_000);
    const { username, password } = credentials.parse(await readJson(req));
    const user = await createAccount(username, await hashPassword(password));
    await createSession(user);
    return Response.json({ user: { id: user.id, username: user.username } }, { status: 201 });
  });
}
