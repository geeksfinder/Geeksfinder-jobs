import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAction } from "@/components/admin/AdminAction";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { activeGrants, resolvePlan, type Grant } from "@/lib/entitlement";
import { longDate, shortDate } from "@/lib/format";
import { LIMITS, getPlan } from "@/lib/plan";
import { planName } from "@/lib/pricing";
import { uuid } from "@/lib/validate";
import { maskPhone } from "@/lib/whatsapp/phone";

const STAGES = ["saved", "applied", "interview", "offer", "rejected"] as const;

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-4 border-b border-line px-4 py-3 last:border-0">
      <dt className="text-small text-ink-2">{k}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  );
}

/** A2 user lookup. Never shows resume text or a full phone number. */
export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { admin, role } = await requireAdmin(AREA_ROLES.users);
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();

  const { data: u } = await admin.from("users").select("id, name, email, phone, plan, telegram_chat_id, disabled_at, marketing_opt_in, created_at").eq("id", id).maybeSingle();
  if (!u) notFound();
  const [{ data: sub }, { data: grants }, { data: alerts }, { data: apps }, { data: attr }, { data: wa }, { period }] = await Promise.all([
    admin.from("subscriptions").select("status, plan_code, current_period_end, trial_end").eq("user_id", id).maybeSingle(),
    admin.from("pro_grants").select("id, days, reason, includes_whatsapp, starts_at, ends_at").eq("user_id", id).order("ends_at", { ascending: false }).limit(10),
    admin.from("alert_settings").select("channels, frequency, alert_hour, last_sent_at").eq("user_id", id).maybeSingle(),
    admin.from("applications").select("stage").eq("user_id", id),
    admin.from("attributions").select("utm_source, utm_medium, utm_campaign, ref_code, landing_path, college, city").eq("user_id", id).maybeSingle(),
    // whatsapp_contacts arrives with migration B; until then this is simply empty
    admin.from("whatsapp_contacts").select("phone_e164, status, opted_out_at, paused, fail_streak").eq("user_id", id).maybeSingle(),
    getPlan(admin, id),
  ]);
  const { data: usage } = await admin.from("usage").select("tailor_count, finder_count").eq("user_id", id).eq("period_start", period).maybeSingle();

  const grantList = (grants ?? []) as (Grant & { id: string; days: number; reason: string })[];
  const effective = resolvePlan(u.plan, grantList);
  const limits = LIMITS[effective === "free" ? "free" : "pro"];
  const stageCount = (s: string) => (apps ?? []).filter((a) => a.stage === s).length;
  const channels = (alerts?.channels ?? []) as string[];
  const canAct = (AREA_ROLES.userActions as readonly string[]).includes(role);
  const isOwner = role === "owner";
  const api = `/api/admin/users/${id}`;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-small text-ink-2">
        <Link href="/admin/users" className="underline-offset-4 hover:underline">Users</Link> <span aria-hidden>/</span> {u.name || "No name"}
      </nav>
      <h1 className="mt-2 text-h1 font-bold">{u.name || "No name"}</h1>
      <p className="mt-1 text-body text-ink-2">
        {u.email} · joined {longDate(u.created_at)} {u.disabled_at && <Badge tone="warning">Sign-in disabled {shortDate(u.disabled_at)}</Badge>}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="plan">
          <h2 id="plan" className="mb-3 text-h3 font-semibold">Plan and usage</h2>
          <dl className="panel">
            <Row k="Effective plan">{effective === "free" ? "Free" : effective === "pro_wa" ? "Pro + WhatsApp" : "Pro"}{u.plan === "free" && effective !== "free" ? " (granted)" : ""}</Row>
            <Row k="Paid plan">{sub ? `${planName(u.plan === "free" ? "free" : "pro", sub.plan_code)} · ${sub.status ?? "unknown"}${sub.current_period_end ? ` · period ends ${shortDate(sub.current_period_end)}` : ""}` : "None"}</Row>
            <Row k="Tailored this cycle"><span className="tabular">{usage?.tailor_count ?? 0} of {limits.tailor}</span></Row>
            <Row k="HR lookups this cycle"><span className="tabular">{usage?.finder_count ?? 0} of {limits.finder}</span></Row>
            <Row k="Pro grants">
              {grantList.length ? (
                <ul className="space-y-1">
                  {grantList.map((g) => (
                    <li key={g.id} className="text-small">
                      {g.days} days · {g.reason}{g.includes_whatsapp ? " · with WhatsApp" : ""} · {shortDate(g.starts_at)} to {shortDate(g.ends_at)}
                      {activeGrants([g]).length ? <span className="ml-1"><Badge tone="success">Active</Badge></span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                "None"
              )}
            </Row>
          </dl>
        </section>

        <section aria-labelledby="channels">
          <h2 id="channels" className="mb-3 text-h3 font-semibold">Channels</h2>
          <dl className="panel">
            <Row k="Alerts">{channels.length ? channels.join(", ") : "Off on every channel"} · {alerts?.frequency ?? "—"} at {alerts?.alert_hour ?? "—"}:00</Row>
            <Row k="Last alert">{alerts?.last_sent_at ? longDate(alerts.last_sent_at) : "Never"}</Row>
            <Row k="Telegram">{u.telegram_chat_id ? "Connected" : "Not connected"}</Row>
            <Row k="WhatsApp">
              {wa ? `${maskPhone(wa.phone_e164)} · ${wa.status}${wa.opted_out_at ? " · replied STOP" : ""}${wa.paused ? " · paused" : ""}` : "Not connected"}
            </Row>
            <Row k="Profile phone">{maskPhone(u.phone)}</Row>
            <Row k="Marketing emails">{u.marketing_opt_in ? "Opted in" : "Not opted in"}</Row>
          </dl>
        </section>

        <section aria-labelledby="tracker">
          <h2 id="tracker" className="mb-3 text-h3 font-semibold">Tracker</h2>
          <dl className="panel grid grid-cols-5 divide-x divide-line">
            {STAGES.map((s) => (
              <div key={s} className="px-3 py-3">
                <dt className="text-tiny capitalize text-ink-2">{s}</dt>
                <dd className="tabular text-h3 font-semibold">{stageCount(s)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="attr">
          <h2 id="attr" className="mb-3 text-h3 font-semibold">Where they came from</h2>
          {attr ? (
            <dl className="panel">
              <Row k="Source">{[attr.utm_source, attr.utm_medium, attr.utm_campaign].filter(Boolean).join(" · ") || "Direct"}</Row>
              <Row k="Referral code">{attr.ref_code ?? "—"}</Row>
              <Row k="Landing page">{attr.landing_path ?? "—"}</Row>
              <Row k="College and city">{[attr.college, attr.city].filter(Boolean).join(", ") || "—"}</Row>
            </dl>
          ) : (
            <p className="panel px-4 py-3 text-body text-ink-2">No data yet. Recorded for students who sign up after attribution tracking ships.</p>
          )}
        </section>
      </div>

      {canAct && (
        <section aria-labelledby="actions" className="mt-10">
          <h2 id="actions" className="mb-3 text-h3 font-semibold">Actions</h2>
          <div className="panel divide-y divide-line">
            <div className="p-4">
              <h3 className="mb-2 text-body font-semibold">Grant Pro days</h3>
              <AdminAction
                action={`${api}/grant`}
                label="Grant Pro days"
                success="Pro days granted"
                fields={[
                  { name: "days", label: "Days", type: "number", min: 1, max: 365, defaultValue: 15, required: true },
                  { name: "reason", label: "Reason", type: "select", options: [{ value: "support", label: "Support goodwill" }, { value: "ambassador", label: "Ambassador reward" }, { value: "referral", label: "Referral reward" }, { value: "other", label: "Other" }] },
                  ...(isOwner ? [{ name: "includes_whatsapp", label: "Include WhatsApp alerts", type: "checkbox" as const }] : []),
                ]}
              />
            </div>
            <div className="flex flex-wrap items-end gap-8 p-4">
              <div>
                <h3 className="mb-2 text-body font-semibold">Usage</h3>
                <AdminAction action={`${api}/reset-quota`} label="Reset this cycle's usage" success="Usage reset" />
              </div>
              {channels.length > 0 && (
                <div>
                  <h3 className="mb-2 text-body font-semibold">Turn off a channel</h3>
                  <AdminAction
                    action={`${api}/channel-off`}
                    label="Turn off"
                    success="Channel turned off"
                    fields={[{ name: "channel", label: "Channel", type: "select", options: channels.map((c) => ({ value: c, label: c })) }]}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-end gap-8 p-4">
              {u.disabled_at ? (
                <AdminAction action={`${api}/disable`} label="Enable sign-in" success="Sign-in enabled" extra={{ disabled: false }} />
              ) : (
                <AdminAction
                  action={`${api}/disable`}
                  label="Disable sign-in"
                  success="Sign-in disabled"
                  variant="danger"
                  extra={{ disabled: true }}
                  confirmWord="disable"
                  confirmText="They can't sign in and get no alerts until you enable sign-in again."
                />
              )}
              {isOwner && (
                <AdminAction
                  action={`${api}/delete-data`}
                  label="Delete account and data"
                  success="Account deleted"
                  variant="danger"
                  confirmWord="delete"
                  confirmText="Cancels Autopay, then deletes the profile, resumes, matches, tracker and WhatsApp data. This can't be undone."
                />
              )}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
