import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";
import { esc, sendTelegram } from "../telegram";

/**
 * Message the owner on Telegram: failed cron, spend at the alert % and at 100%, and later WhatsApp health.
 * Goes to ADMIN_TELEGRAM_CHAT_ID, or else to every owner who has connected Telegram. Not affected by the
 * telegram_sends switch, which is for student messages: the owner must still hear about problems.
 */
export async function adminAlert(text: string, db: SupabaseClient = adminClient()): Promise<boolean> {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.warn(`[admin-alert] no bot token; would have sent: ${text}`);
    return false;
  }
  let chats: (string | number)[] = process.env.ADMIN_TELEGRAM_CHAT_ID ? [process.env.ADMIN_TELEGRAM_CHAT_ID] : [];
  if (!chats.length) {
    const { data: owners } = await db.from("admin_users").select("user_id").eq("role", "owner");
    const ids = (owners ?? []).map((o) => o.user_id as string);
    if (ids.length) {
      const { data: users } = await db.from("users").select("telegram_chat_id").in("id", ids).not("telegram_chat_id", "is", null);
      chats = (users ?? []).map((u) => u.telegram_chat_id as number);
    }
  }
  if (!chats.length) {
    console.warn(`[admin-alert] no owner chat; would have sent: ${text}`);
    return false;
  }
  const results = await Promise.all(chats.map((c) => sendTelegram(c, `<b>GeeksFinder admin</b>\n${esc(text)}`).catch(() => false)));
  return results.some(Boolean);
}
