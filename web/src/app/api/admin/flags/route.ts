import { NextResponse } from "next/server";
import { adminApi, adminNotFound } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { clearFlagCache } from "@/lib/admin/flags";
import { rateLimit } from "@/lib/ratelimit";
import { fail, tooMany } from "@/lib/security";
import { FlagBody } from "@/lib/validate";

/** Owner only: turn a kill switch on or off. The change and its audit row are written in one transaction. */
export async function POST(request: Request) {
  const ctx = await adminApi(AREA_ROLES.flags);
  if (!ctx) return adminNotFound();
  const rl = await rateLimit("api", ctx.user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const parsed = FlagBody.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.find((i) => i.path[0] === "confirm")?.message ?? "That request didn't look right.";
    return NextResponse.json({ error: { code: "bad_request", message } }, { status: 400 });
  }
  const { key, enabled, note } = parsed.data;
  const { data, error } = await ctx.admin.rpc("admin_set_flag", { p_actor: ctx.user.id, p_key: key, p_enabled: enabled, p_note: note ?? null });
  if (error) return fail("admin.flags", error, "The switch didn't change. Try again.");
  clearFlagCache();
  return NextResponse.json({ flag: data });
}
