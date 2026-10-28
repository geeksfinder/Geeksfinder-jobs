import { beforeEach, describe, expect, it, vi } from "vitest";
import { overviewMetrics, type OverviewRaw } from "@/lib/admin/overview";
import { resolvePlan } from "@/lib/entitlement";

type Role = "anon" | "student" | "owner" | "ops" | "marketing" | "reviewer";

/** Supabase stand-in: `rows[table]` answers reads; every write and rpc call is recorded. */
function fakeDb(rows: Record<string, unknown> = {}, rpcResult: { data?: unknown; error?: { message: string } | null } = {}) {
  const writes: { table: string; op: string; value?: unknown }[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "ilike", "in", "lte", "gt", "gte", "order", "limit", "range", "or", "not"]) q[k] = () => q;
    const result = () => ({ data: rows[table] ?? null, error: null });
    q.maybeSingle = async () => result();
    q.single = async () => result();
    for (const op of ["insert", "update", "upsert", "delete"]) q[op] = (value?: unknown) => (writes.push({ table, op, value }), q);
    q.then = (r: (v: unknown) => unknown) => r(result());
    return q;
  };
  const rpc = vi.fn(async () => ({ data: rpcResult.data ?? { ok: true }, error: rpcResult.error ?? null }));
  const auth = { admin: { updateUserById: vi.fn(async () => ({ error: null })), deleteUser: vi.fn(async () => ({ error: null })) } };
  const storage = { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({}) }) };
  return { from, rpc, auth, storage, writes };
}

async function as(role: Role, rows: Record<string, unknown> = {}, rpcResult = {}) {
  vi.resetModules();
  const db = fakeDb({ admin_users: role === "anon" || role === "student" ? null : { role }, users: { id: "u2", name: "Asha", email: "asha@example.com" }, ...rows }, rpcResult);
  vi.doMock("@/lib/supabase/server", () => ({ requireUser: async () => ({ user: role === "anon" ? null : { id: "u1" } }), adminClient: () => db }));
  vi.doMock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true, retryAfter: 60 }) }));
  vi.doMock("@/lib/admin/flags", () => ({ getFlag: async () => true, clearFlagCache: () => {} }));
  return db;
}

const req = (body: unknown) => new Request("http://localhost:3000/api/admin/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ID = "6f1c7a8e-2b4d-4c3e-9a1b-0d2e3f4a5b6c";
const withId = { params: Promise.resolve({ id: ID }) };
const none = { params: Promise.resolve({} as Record<string, never>) };

// route, the roles allowed, and a valid body
const ROUTES = [
  { name: "grant", load: () => import("@/app/api/admin/users/[id]/grant/route"), allowed: ["owner", "ops", "marketing"], body: { days: 15, reason: "support" }, params: withId },
  { name: "reset-quota", load: () => import("@/app/api/admin/users/[id]/reset-quota/route"), allowed: ["owner", "ops"], body: {}, params: withId },
  { name: "channel-off", load: () => import("@/app/api/admin/users/[id]/channel-off/route"), allowed: ["owner", "ops"], body: { channel: "email" }, params: withId },
  { name: "disable", load: () => import("@/app/api/admin/users/[id]/disable/route"), allowed: ["owner", "ops"], body: { disabled: true }, params: withId },
  { name: "delete-data", load: () => import("@/app/api/admin/users/[id]/delete-data/route"), allowed: ["owner"], body: { confirm: "delete" }, params: withId },
  { name: "dnc", load: () => import("@/app/api/admin/dnc/route"), allowed: ["owner", "ops"], body: { email: "hr@zepto.com", action: "add" }, params: none },
  { name: "roles", load: () => import("@/app/api/admin/roles/route"), allowed: ["owner"], body: { email: "asha@example.com", role: "ops" }, params: none },
  { name: "payments/remind", load: () => import("@/app/api/admin/payments/remind/route"), allowed: ["owner", "ops"], body: { user_id: ID }, params: none },
  { name: "jobs/hide", load: () => import("@/app/api/admin/jobs/hide/route"), allowed: ["owner", "ops"], body: { job: ID, action: "hide", reason: "scam" }, params: none },
  { name: "boards", load: () => import("@/app/api/admin/boards/route"), allowed: ["owner", "ops"], body: { action: "pause", provider: "lever", slug: "cred" }, params: none },
] as const;

describe("every PR 2 admin route is a 404 outside its roles", () => {
  for (const r of ROUTES) {
    for (const who of ["anon", "student", "owner", "ops", "marketing", "reviewer"] as const) {
      const ok = (r.allowed as readonly string[]).includes(who);
      it(`${r.name}: ${who} → ${ok ? "allowed" : "404"}`, async () => {
        const db = await as(who, { alert_settings: { channels: ["email", "telegram"] }, subscriptions: { status: "halted", plan_code: "hustle" }, jobs: { id: ID, title: "Trainee", hidden_at: null }, board_sources: { id: "b1", active: true } });
        const res = await (await r.load()).POST(req(r.body), r.params as never);
        if (ok) expect(res.status).not.toBe(404);
        else {
          expect(res.status).toBe(404);
          expect(db.writes).toEqual([]);
          expect(db.rpc).not.toHaveBeenCalled();
        }
      });
    }
  }
});

describe("grants", () => {
  beforeEach(() => vi.resetModules());

  it("refuses Marketing a grant above 30 days, and writes nothing", async () => {
    const db = await as("marketing");
    const { POST } = await import("@/app/api/admin/users/[id]/grant/route");
    const res = await POST(req({ days: 31, reason: "ambassador" }), withId);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/up to 30 days/);
    expect(db.writes).toEqual([]);
  });

  it("only an owner can include WhatsApp", async () => {
    await as("ops");
    const { POST } = await import("@/app/api/admin/users/[id]/grant/route");
    expect((await POST(req({ days: 15, reason: "support", includes_whatsapp: true }), withId)).status).toBe(403);
  });

  it("an owner's grant is saved with an end date and audited", async () => {
    const db = await as("owner", { pro_grants: { id: "g1", starts_at: "x", ends_at: null } });
    const { POST } = await import("@/app/api/admin/users/[id]/grant/route");
    const res = await POST(req({ days: 15, reason: "support" }), withId);
    expect(res.status).toBe(200);
    const insert = db.writes.find((w) => w.table === "pro_grants" && w.op === "insert")!.value as { starts_at: string; ends_at: string; granted_by: string };
    expect(Date.parse(insert.ends_at) - Date.parse(insert.starts_at)).toBe(15 * 86_400_000);
    expect(insert.granted_by).toBe("u1");
    expect(db.writes.some((w) => w.table === "audit_log" && (w.value as { action: string }).action === "user.grant")).toBe(true);
  });
});

describe("do-not-contact and roles", () => {
  it("never removes an address the recruiter asked us to hide", async () => {
    const db = await as("owner", { company_contacts: [{ id: "c1", do_not_contact: true, source: "hr opt-out", opted_out_at: "2026-10-10T00:00:00Z" }] });
    const { POST } = await import("@/app/api/admin/dnc/route");
    const res = await POST(req({ email: "hr@zepto.com", action: "remove" }), none);
    expect(res.status).toBe(409);
    expect(db.writes.filter((w) => w.table === "company_contacts")).toEqual([]);
  });

  it("explains that the last owner can't be removed", async () => {
    await as("owner", {}, { error: { message: "last_owner" } });
    const { POST } = await import("@/app/api/admin/roles/route");
    const res = await POST(req({ email: "asha@example.com", role: null }), none);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/at least one owner/);
  });

  it("deleting data needs the word typed", async () => {
    await as("owner");
    const { POST } = await import("@/app/api/admin/users/[id]/delete-data/route");
    expect((await POST(req({ confirm: "yes" }), withId)).status).toBe(400);
  });
});

describe("effective plan", () => {
  const now = Date.parse("2026-10-19T00:00:00Z");
  const grant = (days: number, wa = false, startOffset = -1) => ({
    starts_at: new Date(now + startOffset * 86_400_000).toISOString(),
    ends_at: new Date(now + (startOffset + days) * 86_400_000).toISOString(),
    includes_whatsapp: wa,
  });
  it("is the higher of the paid plan and an active grant", () => {
    expect(resolvePlan("free", [], now)).toBe("free");
    expect(resolvePlan("free", [grant(15)], now)).toBe("pro");
    expect(resolvePlan("pro", [grant(15, true)], now)).toBe("pro_wa");
    expect(resolvePlan("pro_wa", [grant(15)], now)).toBe("pro_wa");
  });
  it("ignores grants that ended or haven't started", () => {
    expect(resolvePlan("free", [grant(1, false, -5)], now)).toBe("free");
    expect(resolvePlan("free", [grant(10, false, 3)], now)).toBe("free");
  });
});

describe("overview targets", () => {
  const base: OverviewRaw = {
    first_signup_at: "2026-09-19T00:00:00Z", signups: 400, signups_today: 3, signups_7d: 40, profile_ready: 300, activated: 250, weekly_active: 120,
    paid: 30, paid_within_60d: 30, debits_ok_30d: 0, debits_failed_30d: 0, halted: 0, tailored_7d: 300, alerts_today: 10, jobs_today: 80,
    last_job_at: null, enrich_backlog: 0, drafts_waiting: 0,
  };
  const now = Date.parse("2026-10-19T00:00:00Z"); // day 31

  it("colours a number only when it is off target", () => {
    const m = overviewMetrics(base, now);
    expect(m.activation).toMatchObject({ value: "63%", tone: "ok", target: "60% of signups" });
    expect(m.weeklyActive).toMatchObject({ value: "30%", tone: "warning" });
    expect(m.conversion).toMatchObject({ value: "8%", tone: "warning" });
    expect(m.tailoring).toMatchObject({ value: "2.5", tone: "ok" });
    // 1,000 by day 60 → about 517 expected on day 31; 400 is behind but above half pace
    expect(m.signups).toMatchObject({ value: "400", tone: "warning" });
  });

  it("says No data yet instead of a number when there is nothing to measure", () => {
    const m = overviewMetrics({ ...base, signups: 3, weekly_active: 2 }, now);
    expect(m.activation.value).toBeNull();
    expect(m.tailoring.value).toBeNull();
    expect(m.autopay).toMatchObject({ value: null, empty: "Appears after the first Autopay debit." });
  });

  it("autopay success counts captured against failed debits", () => {
    expect(overviewMetrics({ ...base, debits_ok_30d: 17, debits_failed_30d: 3 }, now).autopay).toMatchObject({ value: "85%", tone: "ok" });
    expect(overviewMetrics({ ...base, debits_ok_30d: 6, debits_failed_30d: 4 }, now).autopay).toMatchObject({ value: "60%", tone: "warning" });
  });
});

describe("A3 jobs and sources", () => {
  it("hides a job from a pasted link and records who did it", async () => {
    const db = await as("ops", { jobs: { id: ID, title: "Trainee", hidden_at: null, hidden_reason: null } });
    const { POST } = await import("@/app/api/admin/jobs/hide/route");
    const res = await POST(req({ job: `https://geeksfinder-jobs.vercel.app/apply/${ID}?tab=tailor`, action: "hide", reason: "scam" }), none as never);
    expect(res.status).toBe(200);
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "jobs", op: "update", value: expect.objectContaining({ hidden_reason: "scam" }) }));
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "audit_log", op: "insert", value: expect.objectContaining({ action: "job.hide" }) }));
  });
  it("shows a hidden job again", async () => {
    const db = await as("owner", { jobs: { id: ID, title: "Trainee", hidden_at: "2026-10-28T00:00:00Z", hidden_reason: "other" } });
    const { POST } = await import("@/app/api/admin/jobs/hide/route");
    expect((await POST(req({ job: ID, action: "unhide" }), none as never)).status).toBe(200);
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "jobs", op: "update", value: { hidden_at: null, hidden_reason: null } }));
  });
  it("refuses something that isn't a job id", async () => {
    await as("owner");
    const { POST } = await import("@/app/api/admin/jobs/hide/route");
    expect((await POST(req({ job: "not a link", action: "hide" }), none as never)).status).toBe(400);
  });
  it("checks a new board before adding it, so a typo adds nothing", async () => {
    const db = await as("ops", { board_sources: null });
    vi.doMock("@/lib/safe-fetch", () => ({ safeFetch: async () => ({ status: 404, text: "Not found" }) }));
    const { POST } = await import("@/app/api/admin/boards/route");
    const res = await POST(req({ action: "add", provider: "greenhouse", slug: "razorpayy" }), none as never);
    expect(res.status).toBe(422);
    expect(db.writes).toEqual([]);
  });
  it("adds a board whose job list answers", async () => {
    const db = await as("ops", { board_sources: null });
    vi.doMock("@/lib/safe-fetch", () => ({ safeFetch: async () => ({ status: 200, text: JSON.stringify({ jobs: [{}, {}, {}] }) }) }));
    const { POST } = await import("@/app/api/admin/boards/route");
    const res = await POST(req({ action: "add", provider: "greenhouse", slug: "razorpay", company_name: "Razorpay" }), none as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, jobs: 3 });
    expect(db.writes).toContainEqual(expect.objectContaining({ table: "board_sources", op: "insert" }));
  });
});
