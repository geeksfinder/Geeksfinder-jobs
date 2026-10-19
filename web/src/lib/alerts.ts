/**
 * Alert messages — one source for the morning cron and the first-day "Send a test alert" button,
 * so a test looks exactly like the real thing.
 */
import { cleanCompany } from "./company";
import { esc, sendTelegram } from "./telegram";

/** New accounts can send themselves a test alert during their first 24 hours. */
export const TEST_ALERT_WINDOW_MS = 24 * 3_600_000;
export const canSendTestAlert = (createdAt: string | undefined, now = Date.now()) =>
  Boolean(createdAt) && now - new Date(createdAt!).getTime() < TEST_ALERT_WINDOW_MS;

export type AlertMatch = {
  score: number;
  jobs: { id: string; title: string; company: string; location: string | null; remote: boolean | null; apply_url: string | null; fresher_friendly: boolean | null };
};

const where = (j: AlertMatch["jobs"]) => (j.remote ? "Remote" : j.location ?? "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Greeting, one message per job with buttons, then the paid-plan note for free users. Returns true if any job message was delivered. */
export async function sendTelegramAlert(chatId: number | string, o: { name?: string | null; plan: string; matches: AlertMatch[]; app: string; test?: boolean }) {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const hello = ist.getUTCHours() < 12 ? "Good morning" : "Hi";
  const first = o.name ? `, ${esc(o.name.split(" ")[0])}` : "";
  const intro = o.test
    ? `<b>${hello}${first}</b>\nThis is a test alert. Your real matches arrive like this at your alert time.`
    : `<b>${hello}${first}</b>\n${o.matches.length} new matches for you`;
  await sendTelegram(chatId, intro);

  let delivered = false;
  for (const m of o.matches) {
    const j = m.jobs;
    const text = `<b>${esc(j.title)}</b>\n${esc(cleanCompany(j.company))} · ${esc(where(j))}${j.fresher_friendly ? " · Fresher" : ""}\n<b>${m.score}% match</b>`;
    const ok = await sendTelegram(chatId, text, [
      [...(j.apply_url ? [{ text: "Apply", url: j.apply_url }] : []), { text: "Tailor resume", url: `${o.app}/apply/${j.id}?tab=tailor` }],
      [{ text: "Email HR", url: `${o.app}/apply/${j.id}?tab=email` }, { text: "Open job", url: `${o.app}/apply/${j.id}` }],
    ]);
    delivered ||= ok;
    await sleep(60); // ≤ ~16 msg/s, well under Telegram's limit
  }
  if (o.plan !== "pro") {
    await sendTelegram(chatId, "Get alerts <b>daily</b> and HR emails with a paid plan — from ₹10 every 15 days or ₹20 a month. Cancel anytime from your UPI app.", [
      [{ text: "Try free for 7 days", url: `${o.app}/billing` }],
    ]);
  }
  return delivered;
}

export const alertEmailSubject = (count: number, test?: boolean) =>
  test ? "Test alert: this is how your GeeksFinder matches arrive" : `${count} new jobs matched to your resume`;

/** Email digest. Inline styles only (email clients); colours are the DESIGN.md token values. */
export function alertEmailHtml(matches: AlertMatch[], o: { plan: string; unsubscribeUrl: string; app: string; test?: boolean }) {
  const btn = "display:inline-block;padding:8px 14px;border-radius:10px;font-weight:600;text-decoration:none";
  const rows = matches
    .map(
      (m) => `
    <tr><td style="padding:16px 0;border-bottom:1px solid #E3E7ED">
      <div style="font-size:16px;font-weight:600;color:#14213D">${esc(m.jobs.title)}</div>
      <div style="font-size:14px;color:#4A5568;margin:2px 0 10px">${esc(cleanCompany(m.jobs.company))} · ${esc(where(m.jobs))}${m.jobs.fresher_friendly ? " · Fresher-friendly" : ""} · <b style="color:#14213D">${m.score}% match</b></div>
      <a href="${o.app}/apply/${m.jobs.id}?tab=tailor" style="${btn};background:#2457D6;color:#FFFFFF">Tailor resume</a>
      <a href="${o.app}/apply/${m.jobs.id}?tab=email" style="${btn};border:1px solid #E3E7ED;color:#14213D;margin-left:6px">Email HR</a>
      ${m.jobs.apply_url ? `<a href="${m.jobs.apply_url}" style="font-size:14px;color:#2457D6;margin-left:10px">Apply</a>` : ""}
    </td></tr>`,
    )
    .join("");
  const note = o.test
    ? `<p style="background:#F5F7FA;padding:12px 14px;border-radius:10px;color:#4A5568;font-size:14px">This is a test alert. Your real matches arrive like this at your alert time.</p>`
    : "";
  const upsell =
    o.plan === "pro"
      ? ""
      : `<p style="background:#F5F7FA;padding:12px 14px;border-radius:10px;color:#4A5568;font-size:14px">Get daily alerts and HR emails with <a href="${o.app}/billing" style="color:#2457D6">a paid plan — from ₹10 every 15 days or ₹20 a month</a>. Cancel anytime from your UPI app.</p>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#14213D">
    <p style="font-size:20px;font-weight:700;margin:0 0 4px">GeeksFinder</p>
    <h1 style="font-size:22px;margin:16px 0 4px">Your top matches</h1>
    ${note}
    <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    ${upsell}
    <p style="color:#7A8494;font-size:12px;margin-top:24px">Prefer Telegram? <a href="${o.app}/alerts" style="color:#7A8494">Connect it here</a> · <a href="${o.app}/alerts" style="color:#7A8494">Change frequency</a> · <a href="${o.unsubscribeUrl}" style="color:#7A8494">Unsubscribe from emails</a></p>
  </div>`;
}
