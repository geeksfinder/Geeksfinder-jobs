/**
 * Daily report to every admin by email: jobs, students, alerts, blog (auto-published and held, with reasons)
 * and pipeline health for the last 24 hours.
 *   npx tsx scripts/report.ts          (scheduled at 21:45 IST in .github/workflows/daily.yml)
 * Counts only — no student names, emails or resume content go into the email.
 */
import { withCronRun } from "@/lib/admin/cron-run";
import { sendEmail } from "@/lib/email";
import { SITE } from "@/lib/site";
import { adminClient } from "@/lib/supabase/admin";
import { esc } from "@/lib/telegram";

const db = adminClient();
const DAY = 86_400_000;
const since = new Date(Date.now() - DAY).toISOString();
const live = new Date(Date.now() - 45 * DAY).toISOString();

const count = async (table: string, f: (q: any) => any = (q) => q) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { count: n } = await f(db.from(table).select("*", { count: "exact", head: true }));
  return n ?? 0;
};
const hours = (iso: string | null | undefined) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000) : null);

async function main() {
  const [newJobs, newFresher, newInterns, liveJobs, liveFresher, waitingAi, newUsers, users, paid, matches, alerted, tailored, hrEmails] = await Promise.all([
    count("jobs", (q) => q.gte("created_at", since)),
    count("jobs", (q) => q.gte("created_at", since).eq("fresher_friendly", true)),
    count("jobs", (q) => q.gte("created_at", since).ilike("title", "%intern%")),
    count("jobs", (q) => q.eq("enriched", true).gte("created_at", live)),
    count("jobs", (q) => q.eq("enriched", true).eq("fresher_friendly", true).gte("created_at", live)),
    count("jobs", (q) => q.eq("enriched", false)),
    count("users", (q) => q.gte("created_at", since)),
    count("users"),
    count("subscriptions", (q) => q.in("status", ["active", "authenticated"])),
    count("matches", (q) => q.gte("created_at", since)),
    count("alert_settings", (q) => q.gte("last_sent_at", since)),
    count("tailored_resumes", (q) => q.gte("created_at", since)),
    count("outreach", (q) => q.gte("sent_at", since)),
  ]);

  const { data: srcRows } = await db.from("jobs").select("source").gte("created_at", since).limit(5000);
  const bySource = new Map<string, number>();
  for (const r of srcRows ?? []) bySource.set(String(r.source).split(":")[0], (bySource.get(String(r.source).split(":")[0]) ?? 0) + 1);

  const { data: drafts } = await db.from("article_drafts").select("id, kind, title, status, auto_published, review, created_at").gte("created_at", since).order("created_at");
  const { data: published } = await db.from("articles").select("title, slug, auto_published").gte("published_at", since);
  const { count: waitingReview } = await db.from("article_drafts").select("id", { count: "exact", head: true }).eq("status", "draft");

  const [{ data: lastJob }, { data: lastNews }] = await Promise.all([
    db.from("jobs").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("news_items").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const jobAge = hours(lastJob?.created_at);
  const newsAge = hours(lastNews?.created_at);
  const health: string[] = [];
  if (jobAge === null || jobAge > 30) health.push(`No new jobs saved for ${jobAge ?? "?"} hours — check the 06:00 run in GitHub Actions.`);
  if (newsAge === null || newsAge > 30) health.push(`No news fetched for ${newsAge ?? "?"} hours — check the blog runs in GitHub Actions.`);
  if (waitingAi > 50) health.push(`${waitingAi} jobs waiting for the AI step (Gemini quota may be used up).`);
  const { data: runs } = await db.from("cron_runs").select("job, status, error").gte("started_at", since).in("status", ["failed", "warning"]).order("started_at");
  for (const r of runs ?? []) health.push(`Cron "${r.job}" ${r.status === "failed" ? "failed" : "had warnings"}: ${String(r.error ?? "").split("\n")[0].slice(0, 160)}`);
  const { data: off } = await db.from("app_flags").select("key").eq("enabled", false);
  if (off?.length) health.push(`Switched off: ${off.map((f) => f.key).join(", ")}.`);

  // ---------- email ----------
  const row = (k: string, v: string | number) => `<tr><td style="padding:6px 0;color:#4A5568">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#14213D">${v}</td></tr>`;
  const table = (rows: string) => `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-top:1px solid #E3E7ED">${rows}</table>`;
  const h = (t: string) => `<h2 style="font-size:16px;margin:24px 0 8px;color:#14213D">${t}</h2>`;
  const autoPub = (published ?? []).filter((a) => a.auto_published);
  const held = (drafts ?? []).filter((d) => d.status === "draft");

  const blogList = [
    ...autoPub.map((a) => `<li style="margin:4px 0">✅ <a href="${SITE.url}/blog/${a.slug}" style="color:#2457D6">${esc(a.title)}</a> — published automatically</li>`),
    ...held.map((d) => {
      const why = ((d.review as { held_because?: string[] } | null)?.held_because ?? []).slice(0, 3).map(esc).join("; ");
      return `<li style="margin:4px 0">⏸ ${esc(d.title ?? "Untitled")} <span style="color:#7A8494">(${d.kind})</span> — held: ${why || "needs review"}</li>`;
    }),
  ].join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;color:#14213D">
  <p style="font-size:20px;font-weight:700;margin:0">GeeksFinder daily report</p>
  <p style="color:#7A8494;font-size:13px;margin:4px 0 0">Last 24 hours · ${new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 16).replace("T", " ")} IST</p>
  ${health.length ? `<div style="background:#FFF7ED;border:1px solid #B45309;border-radius:10px;padding:12px 14px;margin-top:16px;font-size:14px;color:#B45309"><b>Needs attention</b><br>${health.map(esc).join("<br>")}</div>` : `<p style="background:#F5F7FA;border-radius:10px;padding:12px 14px;margin-top:16px;font-size:14px;color:#16794C">All pipelines ran normally.</p>`}
  ${h("Jobs")}${table(row("New jobs saved", newJobs) + row("New fresher-friendly", newFresher) + row("New internships", newInterns) + row("Live jobs on the site", liveJobs) + row("Live fresher-friendly", liveFresher) + row("New by source", [...bySource].map(([s, n]) => `${s} ${n}`).join(", ") || "—"))}
  ${h("Students")}${table(row("New sign-ups", newUsers) + row("Total accounts", users) + row("Paid subscriptions", paid) + row("New matches", matches) + row("Students sent an alert", alerted) + row("Resumes tailored", tailored) + row("HR emails sent", hrEmails))}
  ${h("Blog")}${table(row("Drafts written", (drafts ?? []).length) + row("Published automatically", autoPub.length) + row("Published by you", (published ?? []).length - autoPub.length) + row("Waiting in your review queue", waitingReview ?? 0))}
  ${blogList ? `<ul style="font-size:14px;padding-left:18px;margin:12px 0">${blogList}</ul>` : ""}
  <p style="margin-top:24px"><a href="${SITE.url}/admin/drafts" style="display:inline-block;padding:9px 14px;border-radius:10px;background:#2457D6;color:#FFFFFF;text-decoration:none;font-weight:600">Open the review queue</a></p>
  <p style="color:#7A8494;font-size:12px;margin-top:24px">Sent to GeeksFinder admins only. Counts only; no student details.</p>
</div>`;

  const { data: owners } = await db.from("admin_users").select("user_id").eq("role", "owner");
  const { data: admins } = await db.from("users").select("email").in("id", (owners ?? []).map((o) => o.user_id));
  const to = (admins ?? []).map((a) => a.email).filter(Boolean) as string[];
  if (!to.length) {
    console.log("report: no owner accounts to send to");
    return { sent: 0, needs_attention: health.length };
  }
  const subject = `GeeksFinder: ${newJobs} new jobs, ${autoPub.length} posts published${health.length ? " · needs attention" : ""}`;
  let sent = 0;
  for (const email of to) {
    const ok = await sendEmail(email, subject, html);
    if (ok) sent++;
    console.log(`report: ${ok ? "sent" : "FAILED"} to an admin`);
  }
  return { sent, needs_attention: health.length };
}

withCronRun("report", main, db).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
