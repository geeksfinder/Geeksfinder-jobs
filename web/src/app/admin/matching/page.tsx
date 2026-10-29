import Link from "next/link";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { AdminTable, Th } from "@/components/admin/Table";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { median, scoreBands, zeroMatchReason } from "@/lib/admin/ops";
import { MATCH_THRESHOLD } from "@/lib/matching";
import { allRows } from "@/lib/supabase/all-rows";

export const metadata = { title: "Matching" };

type Profile = { user_id: string; skills: string[] | null; preferred_roles: string[] | null; locations: string[] | null; branch: string | null };

/** A4 Matching (SPEC.md §4): how scores spread, matches per student, and who has none and why. Read only. */
export default async function Matching() {
  const { admin } = await requireAdmin(AREA_ROLES.matching);
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [matches, profiles, users] = await Promise.all([
    allRows<{ user_id: string; score: number }>((a, b) => admin.from("matches").select("user_id, score").gte("created_at", since).order("user_id").range(a, b)),
    allRows<Profile>((a, b) => admin.from("profiles").select("user_id, skills, preferred_roles, locations, branch").order("user_id").range(a, b)),
    allRows<{ id: string; name: string | null; email: string; disabled_at: string | null }>((a, b) => admin.from("users").select("id, name, email, disabled_at").order("id").range(a, b)),
  ]);

  const strong = new Map<string, number>();
  const near = new Map<string, number>();
  for (const m of matches) {
    const map = m.score >= MATCH_THRESHOLD ? strong : near;
    map.set(m.user_id, (map.get(m.user_id) ?? 0) + 1);
  }
  const profileOf = new Map(profiles.map((p) => [p.user_id, p]));
  const active = users.filter((u) => !u.disabled_at);
  const perStudent = active.map((u) => strong.get(u.id) ?? 0);
  const zero = active
    .filter((u) => !strong.get(u.id))
    .map((u) => ({ u, p: profileOf.get(u.id) ?? null, near: near.get(u.id) ?? 0 }))
    .map((x) => ({ ...x, reason: zeroMatchReason(x.p, x.near) }));
  const bands = scoreBands(matches.map((m) => m.score));
  const total = matches.length;

  return (
    <>
      <h1 className="text-h1 font-bold">Matching</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">Last 30 days. A match is {MATCH_THRESHOLD}+; 45–59 shows as &ldquo;Worth a look&rdquo; and is never alerted.</p>

      <MetricGrid cols={4}>
        <Metric label="Matches (30 days)" value={matches.filter((m) => m.score >= MATCH_THRESHOLD).length} hint={`${matches.filter((m) => m.score < MATCH_THRESHOLD).length} worth a look`} />
        <Metric label="Matches per student" value={median(perStudent)} hint="median, active students" />
        <Metric label="Students with no matches" value={zero.length} tone={active.length && zero.length / active.length > 0.3 ? "warning" : "ok"} hint={`of ${active.length} active`} />
        <Metric label="Students with a resume" value={profiles.filter((p) => p.skills?.length).length} />
      </MetricGrid>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Score spread</h2>
      <AdminTable head={<><Th>Score</Th><Th>Matches</Th><Th>Share</Th></>} empty={!total && "No matches in the last 30 days."}>
        {bands.map((b) => (
          <tr key={b.label}>
            <td>{b.label}</td>
            <td className="tabular">{b.count}</td>
            <td className="tabular text-ink-2">{total ? `${Math.round((b.count / total) * 100)}%` : "—"}</td>
          </tr>
        ))}
      </AdminTable>

      <h2 className="mb-1 mt-10 text-h3 font-semibold">Students with no matches</h2>
      <p className="mb-3 text-small text-ink-2">The likely reason, most fixable first. Open a student to see their profile.</p>
      <AdminTable head={<><Th>Student</Th><Th>Branch</Th><Th>Likely reason</Th></>} empty={!zero.length && "Every active student has at least one match."}>
        {zero.slice(0, 100).map(({ u, p, reason }) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/users/${u.id}`} className="font-medium text-action underline-offset-4 hover:underline">{u.name || "No name"}</Link>
              <span className="block text-small text-ink-2">{u.email}</span>
            </td>
            <td className="text-ink-2">{p?.branch ?? "—"}</td>
            <td>{reason}</td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
