import { beforeEach, describe, expect, it, vi } from "vitest";
import { spendDecision, monthStartIST } from "@/lib/admin/spend";
import { FlagBody, SpendCapBody } from "@/lib/validate";

/** Minimal Supabase stand-in: per-table rows for reads, and a log of every insert, update and rpc call. */
function fakeDb(tables: Record<string, unknown> = {}, opts: { error?: string } = {}) {
  const calls: { table: string; op: string; value?: unknown }[] = [];
  const from = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "not", "gte", "order", "limit"]) q[k] = () => q;
    const result = () => (opts.error ? { data: null, error: { message: opts.error } } : { data: tables[table] ?? null, error: null });
    q.maybeSingle = async () => result();
    q.single = async () => (table === "cron_runs" ? { data: { id: 7 }, error: null } : result());
    q.insert = (value: unknown) => (calls.push({ table, op: "insert", value }), q);
    q.update = (value: unknown) => (calls.push({ table, op: "update", value }), q);
    q.then = (r: (v: unknown) => unknown) => r(result());
    return q;
  };
  const rpc = vi.fn(async (name: string, args: unknown) => (calls.push({ table: name, op: "rpc", value: args }), { data: { ok: true }, error: null }));
  return { from, rpc, calls };
}

const post = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const noParams = { params: Promise.resolve({} as Record<string, never>) };

/** Load an admin route as a given visitor: signed out, a student, or an admin with a role. */
async function asVisitor(role: "anon" | "student" | "owner" | "ops" | "marketing" | "reviewer") {
  vi.resetModules();
  const db = fakeDb({ admin_users: role === "anon" || role === "student" ? null : { role }, users: { name: "Asha", email: "asha@example.com" } });
  vi.doMock("@/lib/supabase/server", () => ({
    requireUser: async () => ({ user: role === "anon" ? null : { id: "u1" } }),
    adminClient: () => db,
  }));
  vi.doMock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true, retryAfter: 60 }) }));
  return db;
}

describe("admin routes are invisible to everyone but their roles", () => {
  const routes = [
    { path: "/api/admin/flags", load: () => import("@/app/api/admin/flags/route"), body: { key: "telegram_sends", enabled: false, confirm: "telegram_sends" } },
    { path: "/api/admin/spend-caps", load: () => import("@/app/api/admin/spend-caps/route"), body: { provider: "whatsapp", monthly_cap_inr: 500, alert_pct: 80 } },
  ];
  for (const r of routes) {
    for (const who of ["anon", "student", "ops", "marketing", "reviewer"] as const) {
      it(`${r.path}: ${who} gets 404 and nothing changes`, async () => {
        const db = await asVisitor(who);
        const res = await (await r.load()).POST(post(r.path, r.body), noParams);
        expect(res.status).toBe(404);
        expect(db.rpc).not.toHaveBeenCalled();
      });
    }
    it(`${r.path}: the owner's change goes through the audited SQL function`, async () => {
      const db = await asVisitor("owner");
      const res = await (await r.load()).POST(post(r.path, r.body), noParams);
      expect(res.status).toBe(200);
      expect(db.rpc).toHaveBeenCalledTimes(1);
      expect(db.rpc.mock.calls[0][0]).toMatch(/^admin_set_/);
      expect((db.rpc.mock.calls[0][1] as { p_actor: string }).p_actor).toBe("u1");
    });
  }

  it("a switch only changes when its name is typed back", async () => {
    const db = await asVisitor("owner");
    const { POST } = await import("@/app/api/admin/flags/route");
    const res = await POST(post("/api/admin/flags", { key: "whatsapp_sends", enabled: false, confirm: "whatsapp" }), noParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/Type the switch name/);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects unknown switches and out-of-range caps", () => {
    expect(FlagBody.safeParse({ key: "everything", enabled: false, confirm: "everything" }).success).toBe(false);
    expect(SpendCapBody.safeParse({ provider: "whatsapp", monthly_cap_inr: -1 }).success).toBe(false);
    expect(SpendCapBody.safeParse({ provider: "whatsapp", monthly_cap_inr: 500, alert_pct: 120 }).success).toBe(false);
    expect(SpendCapBody.safeParse({ provider: "openai", monthly_cap_inr: 500 }).success).toBe(false);
    expect(SpendCapBody.parse({ provider: "whatsapp", monthly_cap_inr: 500 }).alert_pct).toBe(80);
  });
});

describe("kill switches", () => {
  beforeEach(() => vi.resetModules());

  it("caches a switch for 30 seconds", async () => {
    const { getFlag, clearFlagCache } = await import("@/lib/admin/flags");
    clearFlagCache();
    const off = fakeDb({ app_flags: { enabled: false } });
    expect(await getFlag("telegram_sends", off as never, 1_000)).toBe(false);
    const on = fakeDb({ app_flags: { enabled: true } });
    expect(await getFlag("telegram_sends", on as never, 20_000)).toBe(false); // still cached
    expect(await getFlag("telegram_sends", on as never, 31_001)).toBe(true);
  });

  it("a switch with no row is on; WhatsApp fails closed when the switch can't be read", async () => {
    const { getFlag, clearFlagCache } = await import("@/lib/admin/flags");
    clearFlagCache();
    expect(await getFlag("email_sends", fakeDb({ app_flags: null }) as never)).toBe(true);
    clearFlagCache();
    expect(await getFlag("whatsapp_sends", fakeDb({}, { error: "timeout" }) as never)).toBe(false);
    expect(await getFlag("email_sends", fakeDb({}, { error: "timeout" }) as never)).toBe(true);
  });
});

describe("spend caps", () => {
  const month = "2026-09-30T18:30:00.000Z"; // 1 Oct 2026, 00:00 IST
  const cap = { monthly_cap_inr: 100, alert_pct: 80, alerted_at: null, stopped_at: null };

  it("counts the month from the 1st in IST", () => {
    expect(monthStartIST(Date.parse("2026-10-31T20:00:00Z"))).toBe("2026-11-01"); // already 1 Nov in India
    expect(monthStartIST(Date.parse("2026-10-19T03:00:00Z"))).toBe("2026-10-01");
  });
  it("allows spend under the alert line without telling anyone", () => {
    expect(spendDecision(50, cap, false, month)).toEqual({ ok: true, notify: null });
  });
  it("alerts once at the alert percentage", () => {
    expect(spendDecision(80, cap, false, month)).toEqual({ ok: true, notify: "alert" });
    expect(spendDecision(90, { ...cap, alerted_at: "2026-10-12T05:00:00+00:00" }, false, month)).toEqual({ ok: true, notify: null });
  });
  it("stops at 100% and tells the owner once", () => {
    expect(spendDecision(100, cap, false, month)).toEqual({ ok: false, notify: "stop" });
    expect(spendDecision(130, { ...cap, stopped_at: "2026-10-12T05:00:00+00:00" }, false, month)).toEqual({ ok: false, notify: null });
  });
  it("last month's alert doesn't silence this month's", () => {
    expect(spendDecision(85, { ...cap, alerted_at: "2026-09-20T05:00:00+00:00" }, false, month).notify).toBe("alert");
  });
  it("WhatsApp can't send at all until the owner sets a cap", () => {
    expect(spendDecision(0, null, true, month).ok).toBe(false);
    expect(spendDecision(0, null, false, month).ok).toBe(true);
  });
});

describe("cron run log", () => {
  beforeEach(() => vi.resetModules());

  it("records a good run with its counts", async () => {
    vi.doMock("@/lib/admin/alerts", () => ({ adminAlert: vi.fn() }));
    const { withCronRun } = await import("@/lib/admin/cron-run");
    const db = fakeDb();
    await withCronRun("ingest", async () => ({ inserted: 12 }), db as never);
    expect(db.calls[0]).toMatchObject({ table: "cron_runs", op: "insert", value: { job: "ingest" } });
    expect(db.calls[1]).toMatchObject({ op: "update", value: { status: "ok", counts: { inserted: 12 }, error: null } });
  });

  it("marks warnings", async () => {
    vi.doMock("@/lib/admin/alerts", () => ({ adminAlert: vi.fn() }));
    const { withCronRun } = await import("@/lib/admin/cron-run");
    const db = fakeDb();
    await withCronRun("notify", async (ctx) => ctx.warn("telegram_sends is off"), db as never);
    expect(db.calls[1].value).toMatchObject({ status: "warning", error: "telegram_sends is off" });
  });

  it("marks a crash failed, alerts the owner, and still throws so the workflow goes red", async () => {
    const adminAlert = vi.fn();
    vi.doMock("@/lib/admin/alerts", () => ({ adminAlert }));
    const { withCronRun } = await import("@/lib/admin/cron-run");
    const db = fakeDb();
    await expect(withCronRun("news", async () => { throw new Error("Gemini 403"); }, db as never)).rejects.toThrow("Gemini 403");
    expect(db.calls[1].value).toMatchObject({ status: "failed", error: "Gemini 403" });
    expect(adminAlert).toHaveBeenCalledWith(expect.stringContaining('"news" failed: Gemini 403'), db);
  });
});
