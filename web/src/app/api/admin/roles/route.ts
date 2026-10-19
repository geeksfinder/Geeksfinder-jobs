import { NextResponse } from "next/server";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { RoleBody } from "@/lib/validate";

/** Owner only: add an admin by email, change their role, or remove them (role null). Audited in the same transaction. */
export const POST = adminPost(AREA_ROLES.roles, RoleBody, async ({ admin, user }, { email, role }) => {
  const { data: target } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
  if (!target) return adminError(404, "no_account", "No GeeksFinder account uses that email. Ask them to sign up first, then add them.");
  const { data, error } = await admin.rpc("admin_set_role", { p_actor: user.id, p_user: target.id, p_role: role });
  if (error) {
    return /last_owner/.test(error.message)
      ? adminError(400, "last_owner", "Add another owner first. The panel always needs at least one owner.")
      : adminError(500, "server_error", "The role didn't change. Try again.");
  }
  return NextResponse.json({ admin: data });
});
