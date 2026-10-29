import Link from "next/link";
import { AdminTable, Th } from "@/components/admin/Table";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { BREAKDOWNS, breakdown, funnelSteps, type Attr, type Breakdown } from "@/lib/admin/funnel";
import type { FunnelEvent } from "@/lib/events";
import { allRows } from "@/lib/supabase/all-rows";

export const metadata = { title: "Funnel and acquisition" };

const RANGES = [7, 30, 90] as const;
const LABEL: Record<Breakdown, string> = { source: "Source", campaign: "Campaign", ambassador: "Ambassador", college: "College", week: "Signup week" };
// The steps that matter most when comparing channels
const COLUMNS: { step: FunnelEvent; label: string }[] = [
  { step: "signup", label: "Signed up" },
  { step: "profile_ready", label: "Resume" },
  { step: "channel_connected", label: "Alerts on" },
  { step: "first_action", label: "Acted" },
  { step: "trial_started", label: "Trial" },
  { step: "paid_first", label: "Paid" },
];

/**
 * A12 Funnel and acquisition (SPEC.md §4): distinct students per step in the range, each step's share of the one
 * before, and the same steps by source, campaign, ambassador, college or signup week. Counting rules: lib/admin/funnel.ts.
 */
export default async function Funnel({ searchParams }: { searchParams: Promise<{ days?: string; by?: string }> }) {
  const { admin } = await requireAdmin(AREA_ROLES.funnel);
  const sp = await searchParams;
  const days = RANGES.find((d) => String(d) === sp.days) ?? 30;
  const by: Breakdown = (BREAKDOWNS as readonly string[]).includes(sp.by ?? "") ? (sp.by as Breakdown) : "source";
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [events, attrRows, { data: ambassadors }] = await Promise.all([
    allRows<{ name: string; user_id: string | null; created_at: string }>((a, b) => admin.from("events").select("name, user_id, created_at").gte("created_at", since).order("id").range(a, b)),
    allRows<Attr & { user_id: string }>((a, b) => admin.from("attributions").select("user_id, utm_source, utm_campaign, referrer_host, ref_code").order("user_id").range(a, b)),
    admin.from("ambassadors").select("code, college"),
  ]);
  const attrs = new Map(attrRows.map((a) => [a.user_id, a]));
  const colleges = new Map((ambassadors ?? []).map((a) => [a.code, a.college]));
  const steps = funnelSteps(events);
  const rows = breakdown(events, attrs, by, COLUMNS.map((c) => c.step), colleges);
  const href = (d: number, b: Breakdown) => `/admin/funnel?days=${d}&by=${b}`;
  const tab = (active: boolean) => `inline-flex h-9 items-center rounded-chip px-3 text-small font-medium ${active ? "bg-ink text-white" : "text-ink-2 hover:text-ink"}`;

  return (
    <>
      <h1 className="text-h1 font-bold">Funnel and acquisition</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">Each student counts once per step. Steps are recorded from 29 Oct 2026, so older students show only their later steps.</p>

      <nav aria-label="Date range" className="mb-6 inline-flex rounded-control border border-line p-1">
        {RANGES.map((d) => (
          <Link key={d} href={href(d, by)} aria-current={d === days ? "page" : undefined} className={tab(d === days)}>Last {d} days</Link>
        ))}
      </nav>

      <AdminTable head={<><Th>Step</Th><Th>Students</Th><Th>From the step before</Th></>} empty={!events.length && "No funnel steps recorded in this range yet."}>
        {steps.map((s) => (
          <tr key={s.name}>
            <td>{s.label}</td>
            <td className="tabular font-semibold">{s.count}</td>
            <td className="tabular text-ink-2">{s.fromPrev === null ? "—" : `${s.fromPrev}%`}</td>
          </tr>
        ))}
      </AdminTable>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">By {LABEL[by].toLowerCase()}</h2>
      <nav aria-label="Breakdown" className="mb-4 inline-flex flex-wrap rounded-control border border-line p-1">
        {BREAKDOWNS.map((b) => (
          <Link key={b} href={href(days, b)} aria-current={b === by ? "page" : undefined} className={tab(b === by)}>{LABEL[b]}</Link>
        ))}
      </nav>
      <AdminTable head={<><Th>{LABEL[by]}</Th>{COLUMNS.map((c) => <Th key={c.step}>{c.label}</Th>)}<Th>Signup → paid</Th></>} empty={!rows.length && "Nothing to break down in this range yet."}>
        {rows.slice(0, 50).map((r) => (
          <tr key={r.group}>
            <td className="font-medium">{r.group}</td>
            {r.counts.map((n, i) => <td key={i} className="tabular">{n}</td>)}
            <td className="tabular text-ink-2">{r.counts[0] ? `${Math.round((r.counts[r.counts.length - 1] / r.counts[0]) * 100)}%` : "—"}</td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
