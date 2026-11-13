import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Wraps a route handler: maps ApiError/ZodError to JSON responses, hides internals on 500,
 * and rejects cross-origin state-changing requests (defence in depth on top of SameSite cookies).
 */
export async function handle(req: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") {
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== new URL(req.url).host) {
        throw new ApiError(403, "Cross-origin request rejected");
      }
    }
    return await fn();
  } catch (err) {
    unstable_rethrow(err); // let Next.js control-flow signals (e.g. dynamic-render bailouts) through
    if (err instanceof ApiError) return Response.json({ error: err.message }, { status: err.status });
    if (err instanceof ZodError) {
      return Response.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    console.error(err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}

// Best-effort, per-instance rate limiter (serverless instances don't share memory; good enough for a demo).
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  if (++entry.count > limit) throw new ApiError(429, "Too many attempts, please wait a minute");
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
