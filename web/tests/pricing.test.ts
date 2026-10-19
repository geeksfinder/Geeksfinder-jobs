import { beforeEach, describe, expect, it, vi } from "vitest";
import { periodStart } from "@/lib/plan";
import { PLANS, featureTier, planCode, planName, planTier, whatsappExtra } from "@/lib/pricing";

const DAY = 86_400_000;

describe("the two prices per period", () => {
  it("are ₹10 / ₹20 without WhatsApp and ₹29 / ₹59 with it", () => {
    expect(PLANS[planCode("15d", false)].price).toBe(10);
    expect(PLANS[planCode("30d", false)].price).toBe(20);
    expect(PLANS[planCode("15d", true)].price).toBe(29);
    expect(PLANS[planCode("30d", true)].price).toBe(59);
    expect(whatsappExtra("15d")).toBe(19);
    expect(whatsappExtra("30d")).toBe(39);
  });
  it("WhatsApp plans set users.plan to pro_wa; screens treat both as paid", () => {
    expect(planTier("pro_wa_30")).toBe("pro_wa");
    expect(planTier("pro_15")).toBe("pro");
    expect(featureTier("pro_wa")).toBe("pro");
    expect(featureTier("free")).toBe("free");
    expect(planName("pro_wa", "pro_wa_15")).toBe("Hustle + WhatsApp");
    expect(planName("pro", null)).toBe("Hustle");
    expect(planName("free", "pro_15")).toBe("Fresher");
  });
});

describe("15-day quota windows on every paid plan", () => {
  const now = Date.parse("2026-10-17T00:00:00Z");
  it("15-day plan: the window is the whole period", () => {
    expect(periodStart("pro", new Date(now + 10 * DAY).toISOString(), now)).toBe("2026-10-12");
  });
  it("monthly plan: a fresh window every 15 days inside the month", () => {
    const end = new Date(now + 25 * DAY).toISOString();
    const a = periodStart("pro", end, now);
    const b = periodStart("pro", end, now + 16 * DAY);
    expect(Date.parse(b) - Date.parse(a)).toBe(15 * DAY);
    expect(Date.parse(a)).toBeLessThanOrEqual(now); // window contains today
    expect(Date.parse(a) + 15 * DAY).toBeGreaterThan(now);
  });
  it("Free: one lifetime window", () => {
    expect(periodStart("free", null, now)).toBe("2000-01-01");
  });
});

describe("plan lookups", () => {
  beforeEach(() => {
    process.env.RAZORPAY_PLAN_ID = "plan_old15";
    delete process.env.RAZORPAY_PLAN_ID_PRO_15;
    delete process.env.RAZORPAY_PLAN_ID_HUSTLE;
    process.env.RAZORPAY_PLAN_ID_PRO_WA_30 = "plan_wa30";
  });
  it("maps Razorpay plan ids back to plan codes", async () => {
    const { planFromRazorpayId, razorpayPlanId } = await import("@/lib/pricing");
    expect(razorpayPlanId("pro_15")).toBe("plan_old15"); // falls back to the original env var
    expect(planFromRazorpayId("plan_wa30")).toBe("pro_wa_30");
    expect(planFromRazorpayId("plan_unknown")).toBeNull();
  });
});

describe("checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RAZORPAY_PLAN_ID_PRO_30 = "plan_30";
    process.env.RAZORPAY_PLAN_ID_PRO_WA_15 = "plan_wa15";
    delete process.env.RAZORPAY_PLAN_ID_PRO_WA_30;
    delete process.env.WHATSAPP_PLAN_LIVE;
  });
  function mocks() {
    const rzp = vi.fn(async () => ({ id: "sub_1" }));
    const upsert = vi.fn(async () => ({}));
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null }), upsert };
    vi.doMock("@/lib/supabase/server", () => ({ requireUser: async () => ({ user: { id: "u1", email: "a@b.c" } }), adminClient: () => ({ from: () => q }) }));
    vi.doMock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true }) }));
    vi.doMock("@/lib/razorpay", () => ({ rzp }));
    return { rzp, upsert };
  }
  const post = (plan: unknown) => new Request("http://localhost:3000/api/razorpay/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });

  it("uses the server's Razorpay plan id for the chosen plan", async () => {
    const m = mocks();
    const { POST } = await import("@/app/api/razorpay/subscribe/route");
    expect((await POST(post("pro_30"))).status).toBe(200);
    expect((m.rzp.mock.calls[0] as unknown as [string, { plan_id: string }])[1].plan_id).toBe("plan_30");
    expect((m.upsert.mock.calls[0] as unknown as [{ plan_code: string }])[0].plan_code).toBe("pro_30");
  });

  it("rejects made-up plans, the old plans, and plans not set up yet", async () => {
    const m = mocks();
    const { POST } = await import("@/app/api/razorpay/subscribe/route");
    expect((await POST(post("free-forever"))).status).toBe(400);
    expect((await POST(post("season"))).status).toBe(400);
    expect((await POST(post({ plan_id: "plan_cheap" }))).status).toBe(400);
    process.env.WHATSAPP_PLAN_LIVE = "1";
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "p";
    expect((await POST(post("pro_wa_30"))).status).toBe(503);
    expect(m.rzp).not.toHaveBeenCalled();
  });

  it("won't sell WhatsApp alerts until they are switched on", async () => {
    const m = mocks();
    const { POST } = await import("@/app/api/razorpay/subscribe/route");
    const res = await POST(post("pro_wa_15"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/WhatsApp alerts aren't available yet/);
    expect(m.rzp).not.toHaveBeenCalled();
  });
});
