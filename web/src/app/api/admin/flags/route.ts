import { NextResponse } from "next/server";
import { AREA_ROLES } from "@/lib/admin/constants";
import { clearFlagCache } from "@/lib/admin/flags";
import { adminError, adminPost } from "@/lib/admin/route";
import { FlagBody } from "@/lib/validate";

/** Owner only: turn a kill switch on or off. The change and its audit row are written in one transaction. */
export const POST = adminPost(AREA_ROLES.flags, FlagBody, async ({ admin, user }, { key, enabled, note }) => {
  const { data, error } = await admin.rpc("admin_set_flag", { p_actor: user.id, p_key: key, p_enabled: enabled, p_note: note ?? null });
  if (error) return adminError(500, "server_error", "The switch didn't change. Try again.");
  clearFlagCache();
  return NextResponse.json({ flag: data });
});
