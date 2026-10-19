import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { DisableBody, uuid } from "@/lib/validate";

// About 100 years: Supabase Auth has no "forever"; enabling again clears it
const BAN = "876000h";

/** Disable or re-enable sign-in. A disabled account gets no alerts and can't refresh its session. */
export const POST = adminPost<typeof DisableBody, { id: string }>(AREA_ROLES.userActions, DisableBody, async ({ admin, user }, { disabled }, { id }) => {
  if (!uuid.safeParse(id).success) return adminError(404, "not_found", "Not found.");
  if (id === user.id) return adminError(400, "self", "You can't disable your own account.");
  const { data: target } = await admin.from("users").select("disabled_at").eq("id", id).maybeSingle();
  if (!target) return adminError(404, "not_found", "That student doesn't exist any more.");
  const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: disabled ? BAN : "none" });
  if (error) return adminError(502, "auth_error", "Sign-in couldn't be changed. Try again.");
  const disabled_at = disabled ? new Date().toISOString() : null;
  await admin.from("users").update({ disabled_at }).eq("id", id);
  await audit(user.id, disabled ? "user.disable" : "user.enable", { table: "users", id }, { disabled_at: target.disabled_at }, { disabled_at }, admin);
  return NextResponse.json({ disabled_at });
});
