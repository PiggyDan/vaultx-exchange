import { DUMMY_HASH, credentials, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { ApiError, clientIp, handle, rateLimit, readJson } from "@/lib/server/http";
import { createSession } from "@/lib/server/session";

export async function POST(req: Request) {
  return handle(req, async () => {
    rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    const { username, password } = credentials.parse(await readJson(req));
    const user = await db.user.findUnique({ where: { username } });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new ApiError(401, "Invalid username or password");
    await createSession(user);
    return Response.json({ user: { id: user.id, username: user.username } });
  });
}
