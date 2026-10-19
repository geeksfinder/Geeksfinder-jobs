import Link from "next/link";
import { redirect } from "next/navigation";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { overviewMetrics, type OverviewRaw, type Problem } from "@/lib/admin/overview";
import { monthStartIST } from "@/lib/admin/spend";

export const dynamic = "force-dynamic";

const ago = (iso: string) => {
  const h = Math.round((Date.now() - Date.parse(iso)) / 3_600_000);
  return h < 1 ? "less than an hour ago" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

/** A1 Overview: today vs targets, and the open problems with a link to each. */
export default async function AdminOverview() {
  const { admin, role } = await requireAdmin();
  // Reviewers only see the content queue
  if (!(AREA_ROLES.overview as readonly string[]).includes(role)) redirect("/admin/drafts");

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const monthStart = Date.parse(`${monthStartIST()}T00:00:00+05:30`);
  const thisMonth = (t: string | null) => !!t && Date.parse(t) >= monthStart;
  const [{ data: raw }, { data: runs }, { data: off }, { data: caps }] = await Promise.all([
    admin.rpc("admin_overview"),
    admin.from("cron_runs").select("job, status, error, started_at").gte("started_at", since).in("status", ["failed", "warning"]).order("started_at", { ascending: false }).limit(10),
    admin.from("app_flags").select("key").eq("enabled", false),
    admin.from("spend_caps").select("provider, alerted_at, stopped_at"),
  ]);
  const r = raw as OverviewRaw | null;
  if (!r) return <p className="text-body text-ink-2">The overview couldn&apos;t load. Refresh in a minute.</p>;
  const m = overviewMetrics(r);

  const problems: Problem[] = [];
  for (const run of runs ?? []) {
    problems.push({
      text: `Cron "${run.job}" ${run.status === "failed" ? "failed" : "had warnings"} ${ago(run.started_at)}: ${String(run.error ?? "").split("\n")[0].slice(0, 140)}`,
      href: "/admin/system#runs",
      tone: run.status === "failed" ? "danger" : "warning",
    });
  }
  for (const f of off ?? []) problems.push({ text: `${f.key} is switched off.`, href: "/admin/system#switches", tone: "warning" });
  for (const c of caps ?? []) {
    if (thisMonth(c.stopped_at)) problems.push({ text: `${c.provider} reached its spend cap; its sends are stopped.`, href: "/admin/system#caps", tone: "danger" });
    else if (thisMonth(c.alerted_at)) problems.push({ text: `${c.provider} spend passed its alert level this month.`, href: "/admin/system#caps", tone: "warning" });
  }
  if (!r.last_job_at || Date.now() - Date.parse(r.last_job_at) > 30 * 3_600_000) {
    problems.push({ text: `No new jobs saved for ${r.last_job_at ? ago(r.last_job_at).replace(" ago", "") : "ever"}. Check the 06:00 ingest run.`, href: "/admin/system#runs", tone: "danger" });
  }
  if (r.enrich_backlog > 50) problems.push({ text: `${r.enrich_backlog} jobs are waiting for the AI step. The Gemini quota may be used up.`, href: "/admin/system#runs", tone: "warning" });
  if (r.halted > 0) problems.push({ text: `${r.halted} Autopay mandate${r.halted === 1 ? " is" : "s are"} halted after failed debits.`, href: "/admin/payments", tone: "danger" });
  if (r.debits_failed_30d > 0) problems.push({ text: `${r.debits_failed_30d} debit${r.debits_failed_30d === 1 ? "" : "s"} failed in the last 30 days.`, href: "/admin/payments", tone: "warning" });
  if (r.drafts_waiting > 0) problems.push({ text: `${r.drafts_waiting} blog draft${r.drafts_waiting === 1 ? " is" : "s are"} waiting for review.`, href: "/admin/drafts", tone: "warning" });

  return (
    <>
      <h1 className="text-h1 font-bold">Overview</h1>
      <p className="mt-1 text-body text-ink-2">Live counts. Trends and the funnel arrive with the nightly rollup.</p>

      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-small text-ink-2 md:grid-cols-4">
        {[
          ["Sign-ups today", r.signups_today],
          ["Alerts sent today", r.alerts_today],
          ["New jobs today", r.jobs_today],
          ["Paid subscriptions", r.paid],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="tabular text-h3 font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Open problems</h2>
      {problems.length ? (
        <ul className="panel divide-y divide-line">
          {problems.map((p, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-body">
              <span className={p.tone === "danger" ? "text-danger" : "text-warning"}>{p.text}</span>
              <Link href={p.href} className="text-small text-action underline-offset-4 hover:underline">Open</Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel px-4 py-3 text-body text-ink-2">No problems right now.</p>
      )}

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Targets</h2>
      <MetricGrid>
        <Metric label="Sign-ups" {...m.signups} />
        <Metric label="Activation (profile ready and a channel connected)" {...m.activation} />
        <Metric label="Weekly active students" {...m.weeklyActive} />
        <Metric label="Free to paid" {...m.conversion} />
        <Metric label="Autopay renewal success" {...m.autopay} />
        <Metric label="Tailored resumes per active student" {...m.tailoring} />
        <Metric label="LinkedIn import use" value={null} empty="Appears when LinkedIn import ships. Target 25% of new sign-ups." />
        <Metric label="Pro to Pro + WhatsApp" value={null} empty="Appears after WhatsApp alerts launch. Target 10% of Pro." />
        <Metric label="Organic share of sign-ups" value={null} empty="Appears once sign-ups record where they came from. Target 20% by month 3." />
      </MetricGrid>
      <p className="mt-3 text-small text-ink-3">Weekly active means signed in, tailored a resume, emailed HR or moved a tracker card in the last 7 days.</p>
    </>
  );
}
