import { NextResponse } from "next/server";
import { adminApi, adminNotFound } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { rateLimit } from "@/lib/ratelimit";
import { fail, tooMany } from "@/lib/security";
import { parseJson, SpendCapBody } from "@/lib/validate";

/** Owner only: set a provider's monthly cap in ₹. The change and its audit row are written in one transaction. */
export async function POST(request: Request) {
  const ctx = await adminApi(AREA_ROLES.spendCaps);
  if (!ctx) return adminNotFound();
  const rl = await rateLimit("api", ctx.user.id);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const body = await parseJson(request, SpendCapBody);
  if (!body) return NextResponse.json({ error: { code: "bad_request", message: "Enter a cap in rupees and an alert percentage from 1 to 100." } }, { status: 400 });
  const { data, error } = await ctx.admin.rpc("admin_set_spend_cap", {
    p_actor: ctx.user.id,
    p_provider: body.provider,
    p_cap: body.monthly_cap_inr,
    p_alert_pct: body.alert_pct,
  });
  if (error) return fail("admin.spend-caps", error, "The cap didn't save. Try again.");
  return NextResponse.json({ cap: data });
}
