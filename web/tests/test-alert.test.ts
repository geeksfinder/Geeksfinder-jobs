import { beforeEach, describe, expect, it, vi } from "vitest";
import { canSendTestAlert } from "@/lib/alerts";

const req = (channel: string) => new Request("http://localhost:3000/api/alerts/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }) });

function mockUser(createdAt: string, opts: { telegram?: number | null; limited?: boolean } = {}) {
  const sendTelegramAlert = vi.fn(async () => true);
  const sendEmail = vi.fn(async () => true);
  const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "gte", "order", "limit"]) q[k] = () => q;
    q.single = async () => ({ data });
    q.then = (r: (v: unknown) => unknown) => r({ data: [{ score: 81, jobs: { id: "j1", title: "SDE Intern", company: "Zepto", location: "Bengaluru", remote: false, apply_url: null, fresher_friendly: true } }] });
    return q;
  };
  vi.doMock("@/lib/supabase/server", () => ({
    requireUser: async () => ({
      user: { id: "u1", email: "priya@example.com", created_at: createdAt },
      supabase: { from: () => chain({ name: "Priya", plan: "free", telegram_chat_id: opts.telegram ?? null }) },
    }),
  }));
  vi.doMock("@/lib/admin/flags", () => ({ getFlag: async () => true }));
  vi.doMock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: !opts.limited, retryAfter: 60 }) }));
  vi.doMock("@/lib/email", () => ({ sendEmail }));
  vi.doMock("@/lib/alerts", async (orig) => ({ ...(await orig<typeof import("@/lib/alerts")>()), sendTelegramAlert }));
  return { sendTelegramAlert, sendEmail };
}

describe("first-day test alert", () => {
  beforeEach(() => vi.resetModules());

  it("is only open for 24 hours after sign-up", () => {
    const now = Date.parse("2026-10-17T10:00:00Z");
    expect(canSendTestAlert("2026-10-17T01:00:00Z", now)).toBe(true);
    expect(canSendTestAlert("2026-10-16T09:00:00Z", now)).toBe(false);
    expect(canSendTestAlert(undefined, now)).toBe(false);
  });

  it("refuses accounts older than a day", async () => {
    const m = mockUser(new Date(Date.now() - 3 * 86_400_000).toISOString(), { telegram: 42 });
    const { POST } = await import("@/app/api/alerts/test/route");
    expect((await POST(req("telegram"))).status).toBe(403);
    expect(m.sendTelegramAlert).not.toHaveBeenCalled();
  });

  it("needs Telegram connected before a Telegram test", async () => {
    mockUser(new Date().toISOString(), { telegram: null });
    const { POST } = await import("@/app/api/alerts/test/route");
    expect((await POST(req("telegram"))).status).toBe(400);
  });

  it("is rate limited", async () => {
    const m = mockUser(new Date().toISOString(), { telegram: 42, limited: true });
    const { POST } = await import("@/app/api/alerts/test/route");
    expect((await POST(req("telegram"))).status).toBe(429);
    expect(m.sendTelegramAlert).not.toHaveBeenCalled();
  });

  it("sends to the account's own email only, marked as a test", async () => {
    const m = mockUser(new Date().toISOString());
    const { POST } = await import("@/app/api/alerts/test/route");
    expect((await POST(req("email"))).status).toBe(200);
    const [to, subject] = m.sendEmail.mock.calls[0] as unknown as [string, string];
    expect(to).toBe("priya@example.com");
    expect(subject).toMatch(/^Test alert/);
  });

  it("rejects unknown channels", async () => {
    mockUser(new Date().toISOString());
    const { POST } = await import("@/app/api/alerts/test/route");
    expect((await POST(req("sms"))).status).toBe(400);
  });
});
