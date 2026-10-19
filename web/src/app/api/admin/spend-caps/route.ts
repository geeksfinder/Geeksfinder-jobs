import { NextResponse } from "next/server";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { SpendCapBody } from "@/lib/validate";

/** Owner only: set a provider's monthly cap in ₹. The change and its audit row are written in one transaction. */
export const POST = adminPost(AREA_ROLES.spendCaps, SpendCapBody, async ({ admin, user }, body) => {
  const { data, error } = await admin.rpc("admin_set_spend_cap", { p_actor: user.id, p_provider: body.provider, p_cap: body.monthly_cap_inr, p_alert_pct: body.alert_pct });
  if (error) return adminError(500, "server_error", "The cap didn't save. Try again.");
  return NextResponse.json({ cap: data });
});
