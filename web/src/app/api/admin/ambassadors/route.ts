import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { AmbassadorBody } from "@/lib/validate";

/** Add an ambassador and their link code (/r/<code>), or pause or resume one. A paused code stops counting new visits. */
export const POST = adminPost(AREA_ROLES.ambassadors, AmbassadorBody, async ({ admin, user }, { action, code, name, college, city }) => {
  const { data: before } = await admin.from("ambassadors").select("id, active").eq("code", code).maybeSingle();
  if (action === "add") {
    if (before) return adminError(409, "exists", "That code is taken. Pick another, like PUNE-AMB-08.");
    // A student's own referral code can't be reused as an ambassador code
    const { data: student } = await admin.from("users").select("id").eq("referral_code", code).maybeSingle();
    if (student) return adminError(409, "exists", "That code is a student's referral code. Pick another.");
    if (!name || !college || !city) return adminError(400, "bad_request", "Add the ambassador's name, college and city.");
    const { error } = await admin.from("ambassadors").insert({ code, name, college, city, active: true });
    if (error) return adminError(500, "save_failed", "Couldn't save. Try again.");
    await audit(user.id, "ambassador.add", { table: "ambassadors", id: code }, null, { code, college, city }, admin);
    return NextResponse.json({ ok: true });
  }
  if (!before) return adminError(404, "not_found", "No ambassador with that code.");
  await admin.from("ambassadors").update({ active: action === "resume" }).eq("id", before.id);
  await audit(user.id, `ambassador.${action}`, { table: "ambassadors", id: code }, { active: before.active }, { active: action === "resume" }, admin);
  return NextResponse.json({ ok: true });
});
