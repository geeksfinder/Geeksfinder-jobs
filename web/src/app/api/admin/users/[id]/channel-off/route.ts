import { NextResponse } from "next/server";
import { audit } from "@/lib/admin/audit";
import { AREA_ROLES } from "@/lib/admin/constants";
import { adminError, adminPost } from "@/lib/admin/route";
import { ChannelOffBody, uuid } from "@/lib/validate";

/** Stop alerts on one channel for a student (bounced email, blocked bot, wrong WhatsApp number). */
export const POST = adminPost<typeof ChannelOffBody, { id: string }>(AREA_ROLES.userActions, ChannelOffBody, async ({ admin, user }, { channel }, { id }) => {
  if (!uuid.safeParse(id).success) return adminError(404, "not_found", "Not found.");
  const { data: s } = await admin.from("alert_settings").select("channels").eq("user_id", id).maybeSingle();
  if (!s) return adminError(404, "not_found", "That student has no alert settings.");
  const before = (s.channels ?? []) as string[];
  const after = before.filter((c) => c !== channel);
  await admin.from("alert_settings").update({ channels: after }).eq("user_id", id);
  if (channel === "whatsapp") {
    // Paused, not opted out: the student can turn it back on from Alerts without a new code
    await admin.from("whatsapp_contacts").update({ paused: true, updated_at: new Date().toISOString() }).eq("user_id", id);
  }
  await audit(user.id, "user.channel_off", { table: "alert_settings", id }, { channels: before }, { channels: after }, admin);
  return NextResponse.json({ channels: after });
});
