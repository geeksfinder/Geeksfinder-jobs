import Link from "next/link";
import { AdminAction } from "@/components/admin/AdminAction";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { AdminTable, Th } from "@/components/admin/Table";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { countsSummary, duration } from "@/lib/admin/ops";
import { timeAgo } from "@/lib/format";

export const metadata = { title: "Alerts and crons" };

type Run = { id: number; job: string; status: string; started_at: string; finished_at: string | null; counts: Record<string, unknown> | null; error: string | null };

// The scheduled jobs (daily.yml) and when each runs, so a missed run is easy to spot
const TASKS = [
  { task: "ingest", label: "Job fetch", when: "6:00 IST daily" },
  { task: "notify", label: "Alerts", when: "hourly, 5:30–22:30 IST" },
  { task: "news", label: "Blog drafts", when: "8:45 and 18:45 IST" },
  { task: "report", label: "Daily report", when: "21:45 IST" },
] as const;

const tone = (s: string) => (s === "failed" ? "warning" : s === "ok" ? "success" : "neutral") as "warning" | "success" | "neutral";

/** A5 Alerts and crons (SPEC.md §4): every scheduled run, alerts sent, and re-run through GitHub Actions. */
export default async function Crons() {
  const { admin } = await requireAdmin(AREA_ROLES.crons);
  const { data } = await admin.from("cron_runs").select("id, job, status, started_at, finished_at, counts, error").order("started_at", { ascending: false }).limit(100);
  const runs = (data ?? []) as Run[];
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const last24 = runs.filter((r) => r.started_at >= dayAgo);
  const sent = last24.filter((r) => r.job === "notify").reduce((n, r) => n + Number((r.counts as Record<string, number> | null)?.digests ?? 0), 0);
  const failed24 = last24.filter((r) => r.status === "failed").length;
  const canRerun = Boolean(process.env.GITHUB_ACTIONS_TOKEN && process.env.GITHUB_REPOSITORY);

  return (
    <>
      <h1 className="text-h1 font-bold">Alerts and crons</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">
        Every scheduled run with its result. To pause Telegram or email alerts, use the kill switches in <Link href="/admin/system" className="text-action underline-offset-4 hover:underline">System and security</Link>.
      </p>

      <MetricGrid cols={3}>
        <Metric label="Alerts sent (24 h)" value={sent} hint="students who got a digest" />
        <Metric label="Failed runs (24 h)" value={failed24} tone={failed24 ? "danger" : "ok"} />
        <Metric label="Runs logged (24 h)" value={last24.length} />
      </MetricGrid>

      <h2 className="mb-1 mt-10 text-h3 font-semibold">Scheduled jobs</h2>
      <p className="mb-3 text-small text-ink-2">
        {canRerun ? "Re-run starts the job on GitHub now; it shows below in a minute or two." : "To re-run from here, add GITHUB_ACTIONS_TOKEN and GITHUB_REPOSITORY in Vercel. Until then use GitHub: Actions → Scheduled pipelines → Run workflow."}
      </p>
      <AdminTable head={<><Th>Job</Th><Th>Runs</Th><Th>Last run</Th><Th>Result</Th><Th /></>}>
        {TASKS.map((t) => {
          const last = runs.find((r) => r.job === t.task);
          return (
            <tr key={t.task}>
              <td><span className="font-medium">{t.label}</span><span className="block text-small text-ink-2">{t.task}</span></td>
              <td className="text-small text-ink-2">{t.when}</td>
              <td className="text-small">{last ? `${timeAgo(last.started_at)} · ${duration(last.started_at, last.finished_at)}` : "No run logged yet"}</td>
              <td>{last ? <Badge tone={tone(last.status)}>{last.status}</Badge> : "—"}</td>
              <td className="text-right">
                {canRerun && <AdminAction action="/api/admin/crons/rerun" label="Re-run" success="Run started" variant="text" extra={{ task: t.task }} inline />}
              </td>
            </tr>
          );
        })}
      </AdminTable>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Recent runs</h2>
      <AdminTable head={<><Th>Job</Th><Th>Started</Th><Th>Took</Th><Th>Result</Th><Th>Counts</Th><Th>Warnings or error</Th></>} empty={!runs.length && "No runs logged yet. They appear after the next scheduled run."}>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="font-medium">{r.job}</td>
            <td className="whitespace-nowrap text-small text-ink-2">{timeAgo(r.started_at)}</td>
            <td className="tabular whitespace-nowrap text-small">{duration(r.started_at, r.finished_at)}</td>
            <td><Badge tone={tone(r.status)}>{r.status}</Badge></td>
            <td className="text-small text-ink-2">{countsSummary(r.counts) || "—"}</td>
            <td className="max-w-[40ch] text-small text-ink-2">{r.error ? r.error.split("\n")[0].slice(0, 160) : "—"}</td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
