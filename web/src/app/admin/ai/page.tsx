import Link from "next/link";
import { Metric, MetricGrid } from "@/components/admin/Metric";
import { AdminTable, Th } from "@/components/admin/Table";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { getFlag } from "@/lib/admin/flags";
import { fallbackRate } from "@/lib/admin/ops";
import { monthSpend } from "@/lib/admin/spend";
import { AI_DAILY_CAP } from "@/lib/ai";

export const metadata = { title: "AI usage" };

type Usage = { day: string; provider: string; calls: number; est_cost_usd: number };

/**
 * A7 AI usage and cost (SPEC.md §4). Every AI request counts once for Gemini; one that falls back to Groq counts
 * once more for Groq. Article writing with Claude is capped separately (spend caps, System page).
 */
export default async function AiUsage() {
  const { admin } = await requireAdmin(AREA_ROLES.ai);
  const todayIst = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const since = new Date(Date.now() + 5.5 * 3_600_000 - 29 * 86_400_000).toISOString().slice(0, 10);
  const [{ data }, aiOn, claudeSpent, { data: cap }] = await Promise.all([
    admin.from("ai_usage").select("day, provider, calls, est_cost_usd").gte("day", since).order("day", { ascending: false }),
    getFlag("ai_generation", admin),
    monthSpend("anthropic", admin).catch(() => null),
    admin.from("spend_caps").select("monthly_cap_inr").eq("provider", "anthropic").maybeSingle(),
  ]);
  const rows = (data ?? []) as Usage[];
  const days = [...new Set(rows.map((r) => r.day))];
  const callsOn = (day: string, provider: string) => rows.filter((r) => r.day === day && r.provider === provider).reduce((n, r) => n + r.calls, 0);
  const week = days.slice(0, 7);
  const weekGemini = week.reduce((n, d) => n + callsOn(d, "gemini"), 0);
  const weekGroq = week.reduce((n, d) => n + callsOn(d, "groq"), 0);
  const today = callsOn(todayIst, "gemini");

  return (
    <>
      <h1 className="text-h1 font-bold">AI usage</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">
        Job reading, resume tailoring, cover letters, HR emails and blog drafts. To stop all AI, use the AI generation switch in{" "}
        <Link href="/admin/system" className="text-action underline-offset-4 hover:underline">System and security</Link>.
      </p>

      <MetricGrid cols={4}>
        <Metric label="AI generation" value={aiOn ? "On" : "Paused"} tone={aiOn ? "ok" : "warning"} />
        <Metric label="Calls today" value={today} target={`under ${AI_DAILY_CAP}`} tone={today > AI_DAILY_CAP * 0.8 ? "warning" : "ok"} hint="AI stops for the day at the cap" />
        <Metric label="Fell back to Groq (7 days)" value={`${fallbackRate(weekGemini, weekGroq)}%`} tone={fallbackRate(weekGemini, weekGroq) > 25 ? "warning" : "ok"} hint="Gemini busy or down" />
        <Metric
          label="Claude article spend (month)"
          value={claudeSpent === null ? null : `₹${Math.round(claudeSpent)}`}
          target={cap?.monthly_cap_inr ? `₹${cap.monthly_cap_inr}` : undefined}
          empty="No article spend recorded yet."
        />
      </MetricGrid>

      <h2 className="mb-3 mt-10 text-h3 font-semibold">Last 30 days</h2>
      <AdminTable head={<><Th>Day</Th><Th>Requests (Gemini)</Th><Th>Fell back to Groq</Th><Th>Fallback rate</Th><Th>Estimated cost</Th></>} empty={!days.length && "No AI calls recorded yet."}>
        {days.map((d) => {
          const g = callsOn(d, "gemini");
          const q = callsOn(d, "groq");
          const cost = rows.filter((r) => r.day === d).reduce((n, r) => n + Number(r.est_cost_usd), 0);
          return (
            <tr key={d}>
              <td className="tabular">{d}</td>
              <td className="tabular">{g}</td>
              <td className="tabular">{q}</td>
              <td className="tabular text-ink-2">{fallbackRate(g, q)}%</td>
              <td className="tabular text-ink-2">{cost ? `$${cost.toFixed(2)}` : "free tier"}</td>
            </tr>
          );
        })}
      </AdminTable>
    </>
  );
}
