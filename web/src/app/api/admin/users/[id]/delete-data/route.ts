import { NextResponse } from "next/server";
import { deleteAccount } from "@/lib/account";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { DeleteDataBody, uuid } from "@/lib/validate";

/** Owner only: run the same deletion as "Delete my account" and log it (the audit row keeps no personal data). */
export const POST = adminPost<typeof DeleteDataBody, { id: string }>(AREA_ROLES.deleteData, DeleteDataBody, async ({ admin, user }, _body, { id }) => {
  if (!uuid.safeParse(id).success) return adminError(404, "not_found", "Not found.");
  if (id === user.id) return adminError(400, "self", "Delete your own account from Alerts instead.");
  const { data: target } = await admin.from("users").select("id").eq("id", id).maybeSingle();
  if (!target) return adminError(404, "not_found", "That student doesn't exist any more.");
  const res = await deleteAccount(admin, id, "admin");
  if (!res.ok) {
    return res.step === "autopay"
      ? adminError(502, "autopay", "Autopay couldn't be cancelled, so nothing was deleted. Cancel it in Razorpay, then try again.")
      : adminError(502, "delete_failed", "The account wasn't deleted. Try again.");
  }
  await audit(user.id, "user.delete_data", { table: "users", id }, { exists: true }, { exists: false }, admin);
  return NextResponse.json({ ok: true });
});
