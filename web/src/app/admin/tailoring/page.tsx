import Link from "next/link";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { AdminTable, Th } from "@/components/admin/Table";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { allRows } from "@/lib/supabase/all-rows";

export const metadata = { title: "Tailoring and HR outreach" };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

/**
 * A8 Resume tailoring and A9 HR outreach (SPEC.md §4): how many students tailor, write cover letters and email HR,
 * and how far HR emails get (drafted → sent → follow-up reminder). Do-not-contact has its own page.
 */
export default async function Tailoring() {
  const { admin } = await requireAdmin(AREA_ROLES.tailoring);
  const d30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const d7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [tailored, letters, outreach, { count: students }] = await Promise.all([
    allRows<{ user_id: string; created_at: string }>((a, b) => admin.from("tailored_resumes").select("user_id, created_at").gte("created_at", d30).order("created_at").range(a, b)),
    allRows<{ user_id: string; created_at: string; updated_at: string }>((a, b) => admin.from("cover_letters").select("user_id, created_at, updated_at").gte("created_at", d30).order("created_at").range(a, b)).catch(() => []),
    allRows<{ user_id: string; channel: string | null; status: string | null; sent_at: string | null }>((a, b) => admin.from("outreach").select("user_id, channel, status, sent_at").order("user_id").range(a, b)),
    admin.from("profiles").select("user_id", { count: "exact", head: true }).not("skills", "eq", "{}"),
  ]);
  const tailoredStudents = new Set(tailored.map((t) => t.user_id)).size;
  const edited = letters.filter((l) => new Date(l.updated_at).getTime() - new Date(l.created_at).getTime() > 60_000).length;
  const byStatus = (s: string) => outreach.filter((o) => o.status === s).length;
  const sent = outreach.filter((o) => o.sent_at).length;
  const sent30 = outreach.filter((o) => o.sent_at && o.sent_at >= d30).length;
  const channels = ["email", "linkedin"].map((c) => ({ c, drafted: outreach.filter((o) => o.channel === c).length, sent: outreach.filter((o) => o.channel === c && o.sent_at).length }));

  return (
    <>
      <h1 className="text-h1 font-bold">Tailoring and HR outreach</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">
        Last 30 days unless noted. Addresses students must never see are on <Link href="/admin/dnc" className="text-action underline-offset-4 hover:underline">Do not contact</Link>.
      </p>

      <MetricGrid cols={4}>
        <Metric label="Tailored resumes" value={tailored.length} hint={`${tailored.filter((t) => t.created_at >= d7).length} this week`} />
        <Metric label="Students who tailored" value={tailoredStudents} hint={`${pct(tailoredStudents, students ?? 0)} of students with a resume`} />
        <Metric label="Cover letters" value={letters.length} hint={letters.length ? `${pct(edited, letters.length)} edited by the student` : undefined} />
        <Metric label="HR emails sent" value={sent30} hint={`${sent} all time`} />
      </MetricGrid>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">HR outreach, all time</h2>
      <AdminTable head={<><Th>Step</Th><Th>Count</Th><Th>From the step before</Th></>}>
        <tr><td>Drafted</td><td className="tabular">{outreach.length}</td><td className="text-ink-2">—</td></tr>
        <tr><td>Sent by the student</td><td className="tabular">{sent}</td><td className="tabular text-ink-2">{pct(sent, outreach.length)}</td></tr>
        <tr><td>Follow-up reminder sent (5 days later, still applied)</td><td className="tabular">{byStatus("followup_reminded")}</td><td className="tabular text-ink-2">{pct(byStatus("followup_reminded"), sent)}</td></tr>
      </AdminTable>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">By channel</h2>
      <AdminTable head={<><Th>Channel</Th><Th>Drafted</Th><Th>Sent</Th><Th>Sent rate</Th></>}>
        {channels.map(({ c, drafted, sent: s }) => (
          <tr key={c}>
            <td className="font-medium">{c === "email" ? "Email" : "LinkedIn note"}</td>
            <td className="tabular">{drafted}</td>
            <td className="tabular">{s}</td>
            <td className="tabular text-ink-2">{pct(s, drafted)}</td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
