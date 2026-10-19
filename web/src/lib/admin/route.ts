import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { rateLimit } from "../ratelimit";
import { log } from "../security";
import { adminApi, adminNotFound } from "./auth";
import type { AdminRole } from "./constants";

type AdminCtx = NonNullable<Awaited<ReturnType<typeof adminApi>>>;

/** `{ error: { code, message } }` with a plain message that says what happened and how to fix it (SPEC.md §3). */
export const adminError = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/**
 * Every /api/admin/* POST: role from the database (404 for anyone else), general rate limit, zod body, then the
 * handler. Same-origin is enforced by the middleware for every API POST. Handlers call audit() on success.
 */
export function adminPost<S extends z.ZodTypeAny, P extends Record<string, string> = Record<string, never>>(
  roles: readonly AdminRole[],
  schema: S,
  handler: (ctx: AdminCtx, body: z.infer<S>, params: P) => Promise<Response>,
) {
  return async (request: Request, route: { params: Promise<P> }) => {
    const ctx = await adminApi(roles);
    if (!ctx) return adminNotFound();
    const rl = await rateLimit("api", ctx.user.id);
    if (!rl.ok) return adminError(429, "rate_limited", "Too many changes in a minute. Wait a moment and try again.");

    let raw: unknown = null;
    try {
      raw = await request.json();
    } catch {
      // empty or invalid JSON: let the schema decide
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return adminError(400, "bad_request", parsed.error.issues[0]?.message ?? "That request didn't look right.");
    try {
      return await handler(ctx, parsed.data, ((await route?.params) ?? {}) as P);
    } catch (e) {
      log.error("admin.route", e);
      return adminError(500, "server_error", "That didn't save. Try again in a minute.");
    }
  };
}
