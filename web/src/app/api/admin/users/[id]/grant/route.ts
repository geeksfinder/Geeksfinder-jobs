import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES, MARKETING_GRANT_MAX_DAYS } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { GrantBody, uuid } from "@/lib/validate";

const DAY = 86_400_000;

/** Grant Pro days without a mandate. Marketing up to 30 days; only an owner can include WhatsApp (SPEC.md §5). */
export const POST = adminPost<typeof GrantBody, { id: string }>(AREA_ROLES.grant, GrantBody, async ({ admin, user, role }, body, { id }) => {
  if (!uuid.safeParse(id).success) return adminError(404, "not_found", "Not found.");
  if (role === "marketing" && body.days > MARKETING_GRANT_MAX_DAYS) {
    return adminError(403, "too_many_days", `Marketing can grant up to ${MARKETING_GRANT_MAX_DAYS} days at a time.`);
  }
  if (body.includes_whatsapp && role !== "owner") return adminError(403, "owner_only", "Only an owner can include WhatsApp in a grant.");
  const { data: target } = await admin.from("users").select("id").eq("id", id).maybeSingle();
  if (!target) return adminError(404, "not_found", "That student doesn't exist any more.");

  // A new grant starts when the student's latest grant ends, so grants add up instead of overlapping
  const { data: last } = await admin.from("pro_grants").select("ends_at").eq("user_id", id).order("ends_at", { ascending: false }).limit(1).maybeSingle();
  const start = Math.max(Date.now(), last?.ends_at ? Date.parse(last.ends_at) : 0);
  const row = {
    user_id: id,
    days: body.days,
    includes_whatsapp: body.includes_whatsapp,
    reason: body.reason,
    granted_by: user.id,
    starts_at: new Date(start).toISOString(),
    ends_at: new Date(start + body.days * DAY).toISOString(),
  };
  const { data, error } = await admin.from("pro_grants").insert(row).select("id, starts_at, ends_at").single();
  if (error || !data) return adminError(500, "server_error", "The grant didn't save. Try again.");
  await audit(user.id, "user.grant", { table: "pro_grants", id: data.id }, null, row, admin);
  return NextResponse.json({ grant: data });
});
