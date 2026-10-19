import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { DncBody } from "@/lib/validate";

/**
 * Add or remove a do-not-contact address. Flagged addresses are hidden from every student. "from_recruiter" logs an
 * HR removal request (the recruiter asked us); those, like opt-outs from /hr-opt-out, can never be removed here.
 */
export const POST = adminPost(AREA_ROLES.dnc, DncBody, async ({ admin, user }, { email, action, from_recruiter }) => {
  const now = new Date().toISOString();
  const { data: before } = await admin.from("company_contacts").select("id, do_not_contact, source, opted_out_at").ilike("email", email);
  // A recruiter's own removal request is permanent
  const recruiterAsked = (before ?? []).some((r) => r.opted_out_at || r.source === "hr opt-out" || r.source === "hr removal request");
  if (action === "remove" && recruiterAsked) return adminError(409, "recruiter_request", "The recruiter asked us to remove this address, so it stays hidden.");
  if (action === "add") {
    await admin.from("company_contacts").update({ do_not_contact: true, ...(from_recruiter ? { opted_out_at: now } : {}) }).ilike("email", email);
    if (!before?.length) {
      await admin
        .from("company_contacts")
        .upsert(
          { company_domain: email.split("@")[1], email, source: from_recruiter ? "hr removal request" : "admin", do_not_contact: true, opted_out_at: from_recruiter ? now : null },
          { onConflict: "company_domain,email" },
        );
    }
  } else {
    await admin.from("company_contacts").update({ do_not_contact: false }).ilike("email", email);
  }
  await audit(
    user.id,
    action === "add" ? (from_recruiter ? "dnc.hr_request" : "dnc.add") : "dnc.remove",
    { table: "company_contacts", id: email },
    { rows: before?.length ?? 0, do_not_contact: before?.some((r) => r.do_not_contact) ?? false },
    { do_not_contact: action === "add" },
    admin,
  );
  return NextResponse.json({ ok: true });
});
