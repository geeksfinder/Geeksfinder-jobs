import { AdminAction } from "@/components/admin/AdminAction";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { AdminTable, Th } from "@/components/admin/Table";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { BOARD_PROVIDERS } from "@/lib/boards";
import { longDate, timeAgo } from "@/lib/format";
import { REPORT_REASONS } from "@/lib/job-reports";
import { allRows } from "@/lib/supabase/all-rows";

export const metadata = { title: "Jobs and sources" };

type JobRow = { source: string; fresher_friendly: boolean | null; enriched: boolean; created_at: string; hidden_at: string | null };
type Report = { job_id: string; reason: string; created_at: string; jobs: { id: string; title: string; company: string; source: string; hidden_at: string | null; hidden_reason: string | null } | null };

const sourceOf = (s: string) => s.split(":")[0];
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const reasonLabel = (r: string) => REPORT_REASONS.find((x) => x.id === r)?.label ?? r;

/** A3 Jobs and sources (SPEC.md §4): what each source brought in, reported jobs, and the company boards we read. */
export default async function JobsAndSources() {
  const { admin } = await requireAdmin(AREA_ROLES.jobs);
  const since = new Date(Date.now() - 21 * 86_400_000).toISOString();
  const today = new Date(new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10) + "T00:00:00+05:30").toISOString();

  const [{ data: lastRun }, jobs, { data: reportRows }, boards] = await Promise.all([
    admin.from("cron_runs").select("status, started_at, finished_at, counts, error").eq("job", "ingest").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    allRows<JobRow>((a, b) => admin.from("jobs").select("source, fresher_friendly, enriched, created_at, hidden_at").gte("created_at", since).order("id").range(a, b)),
    admin.from("job_reports").select("job_id, reason, created_at, jobs(id, title, company, source, hidden_at, hidden_reason)").order("created_at", { ascending: false }).limit(500),
    admin.from("board_sources").select("provider, slug, company_name, active, added_at").order("provider").order("slug"),
  ]);
  const counts = (lastRun?.counts ?? {}) as Record<string, number>;

  // Per source: what the last run fetched and kept, then what's live, fresher share, waiting for AI, reports
  const reports = (reportRows ?? []) as unknown as Report[];
  const sources = new Map<string, { live: number; today: number; fresher: number; waiting: number; reports: number }>();
  const row = (s: string) => sources.get(s) ?? (sources.set(s, { live: 0, today: 0, fresher: 0, waiting: 0, reports: 0 }), sources.get(s)!);
  for (const j of jobs) {
    const r = row(sourceOf(j.source));
    if (!j.hidden_at) r.live++;
    if (j.created_at >= today) r.today++;
    if (j.fresher_friendly && !j.hidden_at) r.fresher++;
    if (!j.enriched) r.waiting++;
  }
  for (const r of reports) if (r.jobs) row(sourceOf(r.jobs.source)).reports++;
  const sourceRows = [...sources.entries()].sort((a, b) => b[1].live - a[1].live);

  // Reported jobs, most reports first
  const byJob = new Map<string, { job: NonNullable<Report["jobs"]>; reasons: string[]; last: string }>();
  for (const r of reports) {
    if (!r.jobs) continue;
    const e = byJob.get(r.job_id) ?? { job: r.jobs, reasons: [], last: r.created_at };
    e.reasons.push(r.reason);
    byJob.set(r.job_id, e);
  }
  const reported = [...byJob.values()].sort((a, b) => b.reasons.length - a.reasons.length || b.last.localeCompare(a.last)).slice(0, 50);
  const waitingAi = jobs.filter((j) => !j.enriched).length;
  const boardRows = boards.data ?? [];

  return (
    <>
      <h1 className="text-h1 font-bold">Jobs and sources</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">What each source brought in, jobs students reported, and the company boards the 6:00 run reads.</p>

      <MetricGrid cols={4}>
        <Metric
          label="Last fetch"
          value={lastRun ? (lastRun.status === "ok" ? "OK" : lastRun.status === "warning" ? "Warnings" : lastRun.status === "failed" ? "Failed" : "Running") : null}
          tone={lastRun?.status === "failed" ? "danger" : lastRun?.status === "warning" ? "warning" : "ok"}
          hint={lastRun ? `${timeAgo(lastRun.started_at)} · ${counts.inserted ?? 0} new jobs` : undefined}
          empty="Filled after the next 6:00 run."
        />
        <Metric label="Live jobs (21 days)" value={jobs.filter((j) => !j.hidden_at).length} hint={`${pct(jobs.filter((j) => j.fresher_friendly && !j.hidden_at).length, jobs.filter((j) => !j.hidden_at).length)} fresher-friendly`} />
        <Metric label="Waiting for AI reading" value={waitingAi} tone={waitingAi > 300 ? "warning" : "ok"} hint="Read in batches each run" />
        <Metric label="JSearch quota left" value={counts.jsearch_quota_left ?? null} tone={(counts.jsearch_quota_left ?? 99) < 20 ? "warning" : "ok"} empty="Shown after the next fetch." />
      </MetricGrid>

      {lastRun?.error && (
        <div className="panel mt-4 p-4">
          <h2 className="text-small font-semibold">Warnings from the last fetch</h2>
          <ul className="mt-2 space-y-1 text-small text-ink-2">
            {lastRun.error.split("\n").slice(0, 8).map((w: string, i: number) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Sources</h2>
      <AdminTable
        head={<><Th>Source</Th><Th>Fetched in last run</Th><Th>Kept after quality check</Th><Th>Added today</Th><Th>Live</Th><Th>Fresher share</Th><Th>Waiting for AI</Th><Th>Reports</Th></>}
        empty={!sourceRows.length && "No jobs in the last 21 days."}
      >
        {sourceRows.map(([s, r]) => (
          <tr key={s}>
            <td className="font-medium">{s}</td>
            <td className="tabular">{counts[`fetched_${s}`] ?? "—"}</td>
            <td className="tabular">{counts[`kept_${s}`] ?? "—"}</td>
            <td className="tabular">{r.today}</td>
            <td className="tabular">{r.live}</td>
            <td className="tabular">{pct(r.fresher, r.live)}</td>
            <td className="tabular">{r.waiting}</td>
            <td className="tabular">{r.reports || "—"}</td>
          </tr>
        ))}
      </AdminTable>

      <h2 className="mb-1 mt-10 text-h3 font-semibold">Reported jobs</h2>
      <p className="mb-3 text-small text-ink-2">Three reports from different students hide a job by themselves. Hide it sooner here, or show it again if the reports were wrong.</p>
      <AdminTable head={<><Th>Job</Th><Th>Reports</Th><Th>Status</Th><Th /></>} empty={!reported.length && "No reports yet."}>
        {reported.map(({ job, reasons }) => (
          <tr key={job.id}>
            <td>
              <span className="font-medium">{job.title}</span>
              <span className="block text-small text-ink-2">{job.company} · {sourceOf(job.source)}</span>
            </td>
            <td className="text-small">
              <span className="tabular font-semibold">{reasons.length}</span>{" "}
              <span className="text-ink-2">{[...new Set(reasons)].map(reasonLabel).join(", ")}</span>
            </td>
            <td>{job.hidden_at ? <Badge tone="warning">Hidden · {job.hidden_reason}</Badge> : <Badge>Live</Badge>}</td>
            <td className="space-x-3 whitespace-nowrap text-right">
              {job.hidden_at ? (
                <AdminAction action="/api/admin/jobs/hide" label="Show again" success="Job shown again" variant="text" extra={{ job: job.id, action: "unhide" }} inline />
              ) : (
                <>
                  <AdminAction action="/api/admin/jobs/hide" label="Hide as scam" success="Job hidden" variant="text" extra={{ job: job.id, action: "hide", reason: "scam" }} inline />
                  <AdminAction action="/api/admin/jobs/hide" label="Mark expired" success="Job marked expired" variant="text" extra={{ job: job.id, action: "expired" }} inline />
                </>
              )}
            </td>
          </tr>
        ))}
      </AdminTable>

      <div className="panel mt-6 p-4">
        <h2 className="mb-2 text-body font-semibold">Hide any job</h2>
        <AdminAction
          action="/api/admin/jobs/hide"
          label="Hide job"
          success="Job hidden"
          fields={[
            { name: "job", label: "Job link or id", type: "text", placeholder: "https://…/apply/3f1c2b9e-…", required: true },
            { name: "action", label: "Why", type: "select", defaultValue: "hide", options: [{ value: "hide", label: "Hide" }, { value: "expired", label: "Expired (closed)" }] },
            { name: "reason", label: "Reason (for Hide)", type: "select", defaultValue: "other", options: [{ value: "scam", label: "Scam or asks money" }, { value: "duplicate", label: "Duplicate" }, { value: "other", label: "Other" }] },
          ]}
        />
      </div>

      <h2 className="mb-1 mt-10 text-h3 font-semibold">Company boards</h2>
      <p className="mb-3 text-small text-ink-2">
        {boards.error
          ? "Run supabase/migrations/021_board_sources.sql to manage boards here. Until then the 6:00 run reads scripts/boards.json."
          : `${boardRows.filter((b) => b.active).length} active boards. A new board is checked before it's added: its job list must answer.`}
      </p>
      {!boards.error && (
        <>
          <div className="panel mb-4 p-4">
            <h3 className="mb-2 text-body font-semibold">Add a board</h3>
            <AdminAction
              action="/api/admin/boards"
              label="Check and add"
              success="Board added"
              extra={{ action: "add" }}
              fields={[
                { name: "provider", label: "Provider", type: "select", defaultValue: "greenhouse", options: BOARD_PROVIDERS.map((p) => ({ value: p, label: p })) },
                { name: "slug", label: "Board id (from its job-list address)", type: "text", placeholder: "razorpaysoftwareprivatelimited", required: true },
                { name: "company_name", label: "Company name", type: "text", placeholder: "Razorpay" },
              ]}
            />
          </div>
          <AdminTable head={<><Th>Company</Th><Th>Provider</Th><Th>Board id</Th><Th>Status</Th><Th /></>} empty={!boardRows.length && "No boards yet. The 6:00 run reads scripts/boards.json until one is added."}>
            {boardRows.map((b) => (
              <tr key={`${b.provider}/${b.slug}`}>
                <td className="font-medium">{b.company_name}</td>
                <td className="text-ink-2">{b.provider}</td>
                <td className="text-small text-ink-2">{b.slug}</td>
                <td>{b.active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>}{b.added_at && <span className="ml-2 text-small text-ink-3">since {longDate(b.added_at)}</span>}</td>
                <td className="space-x-3 whitespace-nowrap text-right">
                  <AdminAction action="/api/admin/boards" label={b.active ? "Pause" : "Resume"} success={b.active ? "Board paused" : "Board resumed"} variant="text" extra={{ action: b.active ? "pause" : "resume", provider: b.provider, slug: b.slug }} inline />
                  <AdminAction action="/api/admin/boards" label="Remove" success="Board removed" variant="danger" confirmWord="remove" confirmText="Type remove to stop reading this board. Its jobs already saved stay." extra={{ action: "remove", provider: b.provider, slug: b.slug }} inline />
                </td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}
    </>
  );
}
