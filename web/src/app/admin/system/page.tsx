import { AdminAction } from "@/components/admin/AdminAction";
import { AdminTable, PAGE_SIZE, Pager, Th, readQuery, type TableQuery } from "@/components/admin/Table";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_ROLES, AREA_ROLES, FLAGS, SPEND_PROVIDERS, type FlagKey, type SpendProvider } from "@/lib/admin/constants";
import { monthSpend } from "@/lib/admin/spend";

export const dynamic = "force-dynamic";

const FLAG_INFO: Record<FlagKey, { label: string; what: string }> = {
  whatsapp_sends: { label: "WhatsApp sends", what: "Daily WhatsApp digests and verification codes." },
  telegram_sends: { label: "Telegram sends", what: "Morning alerts, follow-up reminders and blog channel posts." },
  email_sends: { label: "Email sends", what: "Alert emails, test alerts and payment notices." },
  ai_generation: { label: "AI generation", what: "Job enrichment, resume tailoring and blog writing." },
  article_pipeline: { label: "Blog pipeline", what: "News fetching, drafting, reviewing and auto-publishing." },
  paid_contact_lookups: { label: "Paid HR lookups", what: "Hunter searches for HR emails. Company-website lookups still run." },
  signups: { label: "New sign-ups", what: "New accounts. Existing students can still sign in." },
  campaign_sends: { label: "Campaign sends", what: "Email and Telegram announcements, once campaigns ship." },
};

const CAP_NOTE: Record<SpendProvider, string> = {
  whatsapp: "No cap means WhatsApp can't send at all.",
  anthropic: "Claude blog writer. The free Gemini writer isn't capped.",
  hunter: "Free plan: no paid lookups are counted yet.",
  apollo: "Not connected yet.",
};

const ist = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const brief = (v: unknown) => (v == null ? "—" : JSON.stringify(v).slice(0, 120));

/** A18 System and security (owner only): switches, caps, roles, cron runs, audit log, deletions. */
export default async function System({ searchParams }: { searchParams: Promise<TableQuery> }) {
  const { admin, user } = await requireAdmin(AREA_ROLES.system);
  const sp = await searchParams;
  const { page, from, to } = readQuery(sp, ["created_at"] as const, "created_at");

  const [{ data: flags }, { data: caps }, { data: admins }, { data: runs }, { data: log }, { data: deletions }] = await Promise.all([
    admin.from("app_flags").select("key, enabled, note, updated_by, updated_at"),
    admin.from("spend_caps").select("provider, monthly_cap_inr, alert_pct, alerted_at, stopped_at"),
    admin.from("admin_users").select("user_id, role, created_at").order("created_at"),
    admin.from("cron_runs").select("id, job, status, started_at, finished_at, counts, error").order("started_at", { ascending: false }).limit(30),
    admin.from("audit_log").select("id, actor_id, action, target_table, target_id, before, after, created_at").order("created_at", { ascending: false }).range(from, to + 1),
    admin.from("deletion_requests").select("id, requested_by, requested_at, completed_at").order("requested_at", { ascending: false }).limit(20),
  ]);
  const spend = await Promise.all(SPEND_PROVIDERS.map((p) => monthSpend(p, admin).catch(() => null)));
  const peopleIds = [...new Set([...(admins ?? []).map((a) => a.user_id), ...(log ?? []).map((l) => l.actor_id), ...(flags ?? []).map((f) => f.updated_by)].filter(Boolean))] as string[];
  const { data: people } = peopleIds.length ? await admin.from("users").select("id, email").in("id", peopleIds) : { data: [] };
  const email = (id: string | null) => (id ? (people ?? []).find((p) => p.id === id)?.email ?? "Removed account" : "System");
  const logRows = (log ?? []).slice(0, PAGE_SIZE);

  return (
    <>
      <h1 className="text-h1 font-bold">System and security</h1>
      <p className="mb-8 mt-1 text-body text-ink-2">Owner only. Every change here is written to the audit log with who did it and the before and after values.</p>

      <section id="switches" aria-labelledby="sw" className="scroll-mt-6">
        <h2 id="sw" className="mb-1 text-h3 font-semibold">Kill switches</h2>
        <p className="mb-3 text-small text-ink-2">A paused switch stops the code that sends or spends within 30 seconds, including the scheduled runs.</p>
        <div className="panel divide-y divide-line">
          {FLAGS.map((key) => {
            const f = (flags ?? []).find((x) => x.key === key);
            const on = f?.enabled !== false;
            return (
              <div key={key} className="flex flex-wrap items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body font-medium">
                    {FLAG_INFO[key].label} <span className="ml-1">{on ? <Badge tone="success">On</Badge> : <Badge tone="warning">Paused</Badge>}</span>
                  </p>
                  <p className="text-small text-ink-2">{FLAG_INFO[key].what}</p>
                  {f?.updated_by && <p className="text-tiny text-ink-3">Changed by {email(f.updated_by)} · {ist(f.updated_at)}</p>}
                </div>
                {on ? (
                  <AdminAction
                    action="/api/admin/flags"
                    label={`Pause ${FLAG_INFO[key].label.toLowerCase()}`}
                    success="Sends paused"
                    variant="danger"
                    extra={{ key, enabled: false }}
                    confirmWord={key}
                    confirmText={`${FLAG_INFO[key].what} Nothing in this group runs until you resume it.`}
                    inline
                  />
                ) : (
                  <AdminAction action="/api/admin/flags" label="Resume" success="Sends resumed" extra={{ key, enabled: true, confirm: key }} inline />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section id="caps" aria-labelledby="caps-h" className="mt-10 scroll-mt-6">
        <h2 id="caps-h" className="mb-1 text-h3 font-semibold">Spend caps this month</h2>
        <p className="mb-3 text-small text-ink-2">You get one Telegram message at the alert level. At 100% that provider stops until you raise the cap or the month ends.</p>
        <div className="panel divide-y divide-line">
          {SPEND_PROVIDERS.map((p, i) => {
            const c = (caps ?? []).find((x) => x.provider === p);
            const spent = spend[i];
            return (
              <div key={p} className="flex flex-wrap items-end justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-body font-medium capitalize">{p}</p>
                  <p className="text-small text-ink-2">
                    <span className="tabular font-semibold text-ink">{spent === null ? "No data yet" : `₹${spent.toFixed(2)}`}</span>
                    {c ? <span className="text-ink-3"> of ₹{Number(c.monthly_cap_inr).toFixed(0)} · alert at {c.alert_pct}%</span> : <span className="text-ink-3"> · no cap set</span>}
                  </p>
                  <p className="text-tiny text-ink-3">{CAP_NOTE[p]}</p>
                </div>
                <AdminAction
                  action="/api/admin/spend-caps"
                  label={c ? "Change cap" : "Set cap"}
                  success="Saved"
                  extra={{ provider: p }}
                  fields={[
                    { name: "monthly_cap_inr", label: "Cap in ₹ a month", type: "number", min: 0, max: 1_000_000, step: 1, defaultValue: c ? Number(c.monthly_cap_inr) : undefined, required: true },
                    { name: "alert_pct", label: "Alert at %", type: "number", min: 1, max: 100, defaultValue: c?.alert_pct ?? 80, required: true },
                  ]}
                  inline
                />
              </div>
            );
          })}
        </div>
      </section>

      <section id="roles" aria-labelledby="roles-h" className="mt-10 scroll-mt-6">
        <h2 id="roles-h" className="mb-3 text-h3 font-semibold">Admins and roles</h2>
        <AdminTable head={<><Th>Email</Th><Th>Role</Th><Th /></>}>
          {(admins ?? []).map((a) => (
            <tr key={a.user_id}>
              <td>{email(a.user_id)}{a.user_id === user.id && <span className="ml-2 text-ink-3">(you)</span>}</td>
              <td className="capitalize">{a.role}</td>
              <td className="text-right">
                {a.user_id !== user.id && (
                  <AdminAction action="/api/admin/roles" label="Remove" success="Admin removed" variant="danger" extra={{ email: email(a.user_id), role: null }} confirmWord="remove" confirmText="They lose access to the admin panel straight away." inline />
                )}
              </td>
            </tr>
          ))}
        </AdminTable>
        <div className="mt-3">
          <AdminAction
            action="/api/admin/roles"
            label="Add or change admin"
            success="Saved"
            fields={[
              { name: "email", label: "Their GeeksFinder account email", type: "email", required: true },
              { name: "role", label: "Role", type: "select", options: ADMIN_ROLES.map((r) => ({ value: r, label: r })), defaultValue: "ops" },
            ]}
          />
          <p className="mt-2 text-small text-ink-3">Ops: users, jobs, payments (read) and outreach. Marketing: growth tools and up to 30 Pro days. Reviewer: the content queue only.</p>
        </div>
      </section>

      <section id="runs" aria-labelledby="runs-h" className="mt-10 scroll-mt-6">
        <h2 id="runs-h" className="mb-3 text-h3 font-semibold">Recent scheduled runs</h2>
        <AdminTable head={<><Th>Job</Th><Th>Status</Th><Th>Started (IST)</Th><Th>Took</Th><Th>Counts or error</Th></>} empty={!(runs ?? []).length && "No runs logged yet. They appear after the next scheduled run."}>
          {(runs ?? []).map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.job}</td>
              <td>{r.status === "ok" ? <Badge tone="success">OK</Badge> : r.status === "running" ? <Badge>Running</Badge> : <span className={r.status === "failed" ? "font-medium text-danger" : "font-medium text-warning"}>{r.status === "failed" ? "Failed" : "Warning"}</span>}</td>
              <td className="tabular text-ink-2">{ist(r.started_at)}</td>
              <td className="tabular text-ink-2">{r.finished_at ? `${Math.max(1, Math.round((Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000))} s` : "—"}</td>
              <td className="max-w-[28rem] break-words text-ink-2">{r.error ? String(r.error).split("\n")[0].slice(0, 160) : Object.entries((r.counts ?? {}) as Record<string, unknown>).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ") || "—"}</td>
            </tr>
          ))}
        </AdminTable>
      </section>

      <section id="audit" aria-labelledby="audit-h" className="mt-10 scroll-mt-6">
        <h2 id="audit-h" className="mb-3 text-h3 font-semibold">Audit log</h2>
        <AdminTable head={<><Th>When (IST)</Th><Th>Who</Th><Th>Action</Th><Th>Target</Th><Th>Before → after</Th></>} empty={!logRows.length && "No admin changes yet."}>
          {logRows.map((l) => (
            <tr key={l.id}>
              <td className="tabular whitespace-nowrap text-ink-2">{ist(l.created_at)}</td>
              <td>{email(l.actor_id)}</td>
              <td className="font-medium">{l.action}</td>
              <td className="text-ink-2">{l.target_table}{l.target_id ? ` · ${String(l.target_id).slice(0, 36)}` : ""}</td>
              <td className="max-w-[24rem] break-words text-tiny text-ink-2">{brief(l.before)} → {brief(l.after)}</td>
            </tr>
          ))}
        </AdminTable>
        <Pager base="/admin/system" sp={sp} page={page} hasMore={(log ?? []).length > PAGE_SIZE} />
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="del-h">
          <h2 id="del-h" className="mb-3 text-h3 font-semibold">Data deletion requests</h2>
          <AdminTable head={<><Th>Requested by</Th><Th>When (IST)</Th><Th>Done</Th></>} empty={!(deletions ?? []).length && "No deletions yet. Only a hash of the email is kept."}>
            {(deletions ?? []).map((d) => (
              <tr key={d.id}><td className="capitalize">{d.requested_by}</td><td className="tabular text-ink-2">{ist(d.requested_at)}</td><td className="tabular text-ink-2">{d.completed_at ? ist(d.completed_at) : "Pending"}</td></tr>
            ))}
          </AdminTable>
        </section>
        <section aria-labelledby="ops-h">
          <h2 id="ops-h" className="mb-3 text-h3 font-semibold">Backups and errors</h2>
          <dl className="panel divide-y divide-line">
            <div className="px-4 py-3"><dt className="text-small text-ink-2">Last backup and last test restore</dt><dd className="text-body font-semibold">No data yet</dd><dd className="text-small text-ink-3">Appears once restore tests are logged. Supabase&apos;s own backups are listed in its dashboard.</dd></div>
            <div className="px-4 py-3"><dt className="text-small text-ink-2">Error rate</dt><dd className="text-body font-semibold">No data yet</dd><dd className="text-small text-ink-3">Appears once error tracking (Sentry) is connected.</dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}
