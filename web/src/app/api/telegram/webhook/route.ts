import { timingSafeEqual } from "crypto";
import { track } from "@/lib/events";
import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { esc, sendTelegram } from "@/lib/telegram";

const APP = process.env.NEXT_PUBLIC_APP_URL ?? "";


export async function POST(request: Request) {
  // Telegram echoes the secret set via setWebhook?secret_token=... (fail closed if unset)
  if (!secretOk(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = await request.json().catch(() => null);
  const msg = update?.message;
  if (!msg?.text) return NextResponse.json({ ok: true });

  const chatId: number = msg.chat.id;
  const [cmd, arg] = msg.text.trim().split(/\s+/);
  const admin = adminClient();

  if (cmd === "/start" && arg && /^[A-Za-z0-9_-]{16,64}$/.test(arg)) {
    const { data: user } = await admin
      .from("users")
      .select("id, name, telegram_link_expires_at")
      .eq("telegram_link_code", arg)
      .maybeSingle();
    const expired = !user?.telegram_link_expires_at || new Date(user.telegram_link_expires_at).getTime() < Date.now();
    if (!user || expired) {
      await sendTelegram(chatId, "This link has expired. Open the website and tap <b>Connect Telegram</b> again.");
    } else {
      // One-time: clear the code; unlink this chat from any other account first
      await admin.from("users").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId);
      await admin.from("users").update({ telegram_chat_id: chatId, telegram_link_code: null, telegram_link_expires_at: null }).eq("id", user.id);
      await track(admin, "channel_connected", user.id, { channel: "telegram" });
      const { data: a } = await admin.from("alert_settings").select("channels").eq("user_id", user.id).maybeSingle();
      if (a && !a.channels.includes("telegram")) {
        await admin.from("alert_settings").update({ channels: [...a.channels, "telegram"] }).eq("user_id", user.id);
      }
      await sendTelegram(
        chatId,
        `Connected${user.name ? `, ${esc(user.name.split(" ")[0])}` : ""}. Your matched jobs will arrive here every morning.\n\nSend /stop to pause alerts.`,
        [[{ text: "Open my matches", url: `${APP}/dashboard` }]],
      );
    }
  } else if (cmd === "/start") {
    await sendTelegram(chatId, "To get job alerts, sign up on the website and tap <b>Connect Telegram</b>.", [
      [{ text: "Sign up free", url: `${APP}/login` }],
    ]);
  } else if (cmd === "/stop") {
    await admin.from("users").update({ telegram_chat_id: null }).eq("telegram_chat_id", chatId);
    await sendTelegram(chatId, "Alerts paused. Reconnect any time from Alerts on the website.");
  } else {
    await sendTelegram(chatId, "Commands:\n/stop — pause alerts\n\nManage everything on the website.", [
      [{ text: "Open website", url: `${APP}/dashboard` }],
    ]);
  }
  return NextResponse.json({ ok: true });
}

function secretOk(got: string | null) {
  const want = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!want || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
