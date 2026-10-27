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
// Links from job feeds go inside href="…": a stray quote must not end the attribute
const href = (url: string) => esc(url).replace(/"/g, "%22");
// Telegram's limit is 4,096 characters per message; leave room for the greeting and the plan note
const MAX_BODY = 3600;

/**
 * The whole alert as ONE message (DESIGN.md TelegramAlertPreview): greeting, "N new matches", a short block per job
 * with Open job / Tailor resume / Apply links, the paid-plan note for free users, then two buttons. One message
 * instead of one per job: 5–10× faster at 7:30 and calmer to read. Returns whether Telegram accepted it.
 */
export function telegramAlertText(o: { name?: string | null; plan: string; matches: AlertMatch[]; app: string; test?: boolean }, now = Date.now()) {
  const ist = new Date(now + 5.5 * 3_600_000);
  const hello = ist.getUTCHours() < 12 ? "Good morning" : "Hi";
  const first = o.name ? `, ${esc(o.name.split(" ")[0])}` : "";
  const intro = o.test
    ? `<b>${hello}${first}</b>\nThis is a test alert. Your real matches arrive like this at your alert time.`
    : `<b>${hello}${first}</b>\n${o.matches.length} new ${o.matches.length === 1 ? "match" : "matches"} for you`;

  const blocks: string[] = [];
  let length = 0;
  for (const [i, m] of o.matches.entries()) {
    const j = m.jobs;
    const links = [`<a href="${o.app}/apply/${j.id}">Open job</a>`, `<a href="${o.app}/apply/${j.id}?tab=tailor">Tailor resume</a>`];
    if (j.apply_url) links.push(`<a href="${href(j.apply_url)}">Apply</a>`);
    const block = `${i + 1}. <b>${esc(j.title)}</b>\n${esc(cleanCompany(j.company))} · ${esc(where(j))}${j.fresher_friendly ? " · Fresher" : ""} · <b>${m.score}% match</b>\n${links.join(" · ")}`;
    if (length + block.length > MAX_BODY) {
      blocks.push(`…and ${o.matches.length - i} more in the app.`);
      break;
    }
    blocks.push(block);
    length += block.length;
  }
  const note = o.plan !== "pro" ? "\n\nGet alerts <b>daily</b> and HR emails with a paid plan, from ₹10 every 15 days or ₹20 a month. Cancel anytime from your UPI app." : "";
  return `${intro}\n\n${blocks.join("\n\n")}${note}`;
}

export async function sendTelegramAlert(chatId: number | string, o: { name?: string | null; plan: string; matches: AlertMatch[]; app: string; test?: boolean }) {
  const top = o.matches[0]?.jobs;
  const buttons = [
    [...(top ? [{ text: "Tailor top match", url: `${o.app}/apply/${top.id}?tab=tailor` }] : []), { text: "See all matches", url: `${o.app}/dashboard` }],
    ...(o.plan !== "pro" ? [[{ text: "Try free for 7 days", url: `${o.app}/billing` }]] : []),
  ];
  return sendTelegram(chatId, telegramAlertText(o), buttons);
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
