import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";

export default async function AdminOverview() {
  const { admin } = await requireAdmin(AREA_ROLES.overview);
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const dayStart = `${today}T00:00:00+05:30`;
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);

  const [users, paid, alertsToday, telegram, jobsToday, drafts, ai] = await Promise.all([
    count(admin.from("users").select("id", { count: "exact", head: true })),
    count(admin.from("users").select("id", { count: "exact", head: true }).eq("plan", "pro")),
    count(admin.from("alert_settings").select("user_id", { count: "exact", head: true }).gte("last_sent_at", dayStart)),
    count(admin.from("users").select("id", { count: "exact", head: true }).not("telegram_chat_id", "is", null)),
    count(admin.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", dayStart)),
    count(admin.from("article_drafts").select("id", { count: "exact", head: true }).eq("status", "draft")),
    admin.from("ai_usage").select("provider, calls").eq("day", today).then((r) => r.data ?? []),
  ]);

  const stats = [
    ["Users", users],
    ["Paid plans", paid],
    ["Telegram connected", telegram],
    ["Alerts sent today", alertsToday],
    ["New jobs today", jobsToday],
    ["Drafts to review", drafts],
  ] as const;

  return (
    <>
      <h1 className="mb-6 text-h1 font-bold">Overview</h1>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line md:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-paper p-5">
            <dt className="text-small text-ink-2">{k}</dt>
            <dd className="tabular text-h2 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mb-3 mt-10 text-h3 font-semibold">AI calls today</h2>
      {ai.length ? (
        <ul className="panel divide-y divide-line">
          {ai.map((r) => (
            <li key={r.provider} className="flex justify-between px-4 py-3 text-body">
              <span>{r.provider}</span>
              <span className="tabular">{r.calls}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-ink-2">No AI calls yet today.</p>
      )}
    </>
  );
}
