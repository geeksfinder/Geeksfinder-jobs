import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { getPlan } from "@/lib/plan";
import { EmptyBody, uuid } from "@/lib/validate";

/** Reset this cycle's tailoring and HR lookup counts (support goodwill, or after a failed run). */
export const POST = adminPost<typeof EmptyBody, { id: string }>(AREA_ROLES.userActions, EmptyBody, async ({ admin, user }, _body, { id }) => {
  if (!uuid.safeParse(id).success) return adminError(404, "not_found", "Not found.");
  const { period } = await getPlan(admin, id);
  const { data: before } = await admin.from("usage").select("tailor_count, finder_count").eq("user_id", id).eq("period_start", period).maybeSingle();
  if (!before) return NextResponse.json({ ok: true, note: "Nothing used this cycle." });
  await admin.from("usage").update({ tailor_count: 0, finder_count: 0 }).eq("user_id", id).eq("period_start", period);
  await audit(user.id, "user.reset_quota", { table: "usage", id: `${id}:${period}` }, before, { tailor_count: 0, finder_count: 0 }, admin);
  return NextResponse.json({ ok: true });
});
