"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { uuid } from "@/lib/validate";

export async function setDoNotContact(id: string, flagged: boolean) {
  const { user, admin } = await requireAdmin(AREA_ROLES.contacts);
  if (!uuid.safeParse(id).success) throw new Error("bad request");
  const { data: before } = await admin.from("company_contacts").select("email, do_not_contact, source, opted_out_at").eq("id", id).single();
  // A recruiter's own removal request is permanent
  if (!flagged && (before?.opted_out_at || before?.source === "hr opt-out" || before?.source === "hr removal request")) return;
  await admin.from("company_contacts").update({ do_not_contact: flagged }).eq("id", id);
  await audit(user.id, flagged ? "contact.flag" : "contact.unflag", { table: "company_contacts", id }, before, { do_not_contact: flagged });
  revalidatePath("/admin/contacts");
}
