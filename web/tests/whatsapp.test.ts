import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { costWithGst, pickRate, type Rate } from "@/lib/whatsapp/cost";
import { whatsappBlocker } from "@/lib/whatsapp/eligibility";
import { hashCode } from "@/lib/whatsapp/otp";
import { maskPhone, toE164 } from "@/lib/whatsapp/phone";
import { chooseTemplate, cleanParam, digestMessage, jobLine } from "@/lib/whatsapp/templates";
import { keywordOf, verifySignature } from "@/lib/whatsapp/webhook";
import { memDb } from "./helpers/memdb";

describe("phone numbers", () => {
  it("accepts Indian mobiles with or without +91, spaces or dashes", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("+91 98765-43210")).toBe("+919876543210");
    expect(toE164("09876543210")).toBe("+919876543210");
    expect(toE164("919876543210")).toBe("+919876543210");
  });
  it("rejects letters, wrong lengths and non-mobile Indian numbers", () => {
    expect(toE164("98765abcde")).toBeNull();
    expect(toE164("98765")).toBeNull();
    expect(toE164("+9198765432101234")).toBeNull();
    expect(toE164("1234567890")).toBeNull(); // Indian mobiles start 6–9
    expect(toE164("+91 12345 67890")).toBeNull();
  });
  it("keeps other countries in E.164", () => {
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
  });
  it("masks as 98xxxxxx21", () => {
    expect(maskPhone("+919876543221")).toBe("98xxxxxx21");
    expect(maskPhone("9876543221")).toBe("98xxxxxx21");
    expect(maskPhone(null)).toBe("—");
  });
});

describe("template parameters", () => {
  it("turns a messy 200-character title into one clean line of at most 60 characters", () => {
    const messy = `Senior\nFrontend\tDeveloper *Intern*   ${"x".repeat(200)}`;
    const line = cleanParam(messy);
    expect(line.length).toBeLessThanOrEqual(60);
    expect(line).not.toMatch(/[\n\t*]/);
    expect(line).not.toMatch(/ {2}/);
    expect(cleanParam(`a${String.fromCharCode(0x2028)}b`)).toBe("a b");
  });
  it("formats a job line", () => {
    expect(jobLine({ id: "j", title: "Frontend Developer Intern", company: "Zepto", city: "Bengaluru", score: 87.4 })).toBe("Frontend Developer Intern · Zepto · Bengaluru · 87%");
  });
  it("picks the template by number of new matches", () => {
    expect(chooseTemplate(0)).toBeNull();
    expect(chooseTemplate(1)).toBe("gf_daily_1");
    expect(chooseTemplate(2)).toBe("gf_daily_1");
    expect(chooseTemplate(3)).toBe("gf_daily_3");
    expect(chooseTemplate(5)).toBe("gf_daily_3");
  });
  it("fills the digest from the top matches by score", () => {
    const jobs = [10, 90, 50, 70, 30].map((score, i) => ({ id: `j${i}`, title: `Role ${i}`, company: "Acme", city: "Pune", score }));
    const msg = digestMessage("Priya Sharma", "d1", jobs)!;
    expect(msg.template).toBe("gf_daily_3");
    expect(msg.body).toEqual(["Priya", "5", "Role 1 · Acme · Pune · 90%", "Role 3 · Acme · Pune · 70%", "Role 2 · Acme · Pune · 50%"]);
    expect(msg.buttons).toEqual(["d1", "j1"]);
    expect(digestMessage("Priya", "d1", jobs.slice(0, 2))!.body).toHaveLength(3);
    expect(digestMessage("Priya", "d1", [])).toBeNull();
  });
});

describe("canSendWhatsApp", () => {
  const ok = { planAllows: true, contact: { status: "verified", consent_at: "2026-10-19", opted_out_at: null, paused: false }, switchOn: true, underCap: true };
  it("passes only when every condition holds", () => {
    expect(whatsappBlocker(ok)).toBeNull();
  });
  it("names the first failing condition", () => {
    expect(whatsappBlocker({ ...ok, planAllows: false })).toBe("plan");
    expect(whatsappBlocker({ ...ok, contact: null })).toBe("not_verified");
    expect(whatsappBlocker({ ...ok, contact: { ...ok.contact, status: "pending" } })).toBe("not_verified");
    expect(whatsappBlocker({ ...ok, contact: { ...ok.contact, consent_at: null } })).toBe("no_consent");
    expect(whatsappBlocker({ ...ok, contact: { ...ok.contact, opted_out_at: "2026-10-19" } })).toBe("opted_out");
    expect(whatsappBlocker({ ...ok, contact: { ...ok.contact, paused: true } })).toBe("paused");
    expect(whatsappBlocker({ ...ok, switchOn: false })).toBe("switch_off");
    expect(whatsappBlocker({ ...ok, underCap: false })).toBe("cap");
  });
});

describe("message cost", () => {
  const card: Rate[] = [
    { category: "marketing", inr_per_msg: 0.8631, gst_pct: 18, effective_from: "2026-10-01" },
    { category: "utility", inr_per_msg: 0.115, gst_pct: 18, effective_from: "2026-10-01" },
    { category: "authentication", inr_per_msg: 0.115, gst_pct: 18, effective_from: "2026-10-01" },
    { category: "service", inr_per_msg: 0.115, gst_pct: 18, effective_from: "2026-10-01" },
    { category: "marketing", inr_per_msg: 0.9, gst_pct: 18, effective_from: "2026-12-01" },
  ];
  it("adds 18% GST for every category", () => {
    expect(costWithGst(pickRate(card, "marketing", "2026-10-19")!)).toBe(1.0185);
    expect(costWithGst(pickRate(card, "utility", "2026-10-19")!)).toBe(0.1357);
    expect(costWithGst(pickRate(card, "authentication", "2026-10-19")!)).toBe(0.1357);
    expect(costWithGst(pickRate(card, "service", "2026-10-19")!)).toBe(0.1357);
  });
  it("15 daily digests at the marketing rate cost about ₹15.28 (spec cost basis)", () => {
    expect(Math.round(costWithGst(card[0]) * 15 * 100) / 100).toBeCloseTo(15.28, 1);
  });
  it("uses the rate in force on the day, never a future one", () => {
    expect(pickRate(card, "marketing", "2026-11-30")!.inr_per_msg).toBe(0.8631);
    expect(pickRate(card, "marketing", "2026-12-01")!.inr_per_msg).toBe(0.9);
    expect(pickRate(card, "marketing", "2026-09-01")).toBeNull();
  });
});

describe("webhook signature", () => {
  const body = '{"entry":[]}';
  const sign = (b: string, secret = "s3cret") => `sha256=${createHmac("sha256", secret).update(b).digest("hex")}`;
  it("accepts a valid signature", () => expect(verifySignature(body, sign(body), "s3cret")).toBe(true));
  it("rejects a wrong secret, a changed body, a missing header or no secret", () => {
    expect(verifySignature(body, sign(body, "other"), "s3cret")).toBe(false);
    expect(verifySignature(`${body} `, sign(body), "s3cret")).toBe(false);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
    expect(verifySignature(body, "sha256=zz", "s3cret")).toBe(false);
    expect(verifySignature(body, sign(body), undefined)).toBe(false);
  });
  it("reads STOP words in any case", () => {
    expect(keywordOf(" Stop ")).toBe("stop");
    expect(keywordOf("UNSUBSCRIBE")).toBe("stop");
    expect(keywordOf("cancel.")).toBe("stop");
    expect(keywordOf("start")).toBe("start");
    expect(keywordOf("please stop sending")).toBeNull();
  });
});

// ---------- routes ----------

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
type Db = ReturnType<typeof memDb>;

function seed(plan: "free" | "pro_wa" = "pro_wa") {
  return memDb({
    users: [{ id: U1, plan, name: "Priya" }, { id: U2, plan: "pro_wa" }],
    plan_limits: [{ plan: "free", whatsapp: false }, { plan: "pro", whatsapp: false }, { plan: "pro_wa", whatsapp: true }],
    pro_grants: [],
    alert_settings: [{ user_id: U1, channels: ["telegram"] }],
    wa_rate_card: [{ category: "authentication", inr_per_msg: 0.115, gst_pct: 18, effective_from: "2026-10-01" }, { category: "utility", inr_per_msg: 0.115, gst_pct: 18, effective_from: "2026-10-01" }, { category: "service", inr_per_msg: 0.115, gst_pct: 18, effective_from: "2026-10-01" }],
  });
}

const sendTemplate = vi.fn(async () => ({ ok: true as const, messageId: `wamid.${Math.random()}` }));
const sendFixedReply = vi.fn(async () => ({ ok: true as const, messageId: `wamid.${Math.random()}` }));

async function load(db: Db, user: string | null) {
  vi.resetModules();
  sendTemplate.mockClear();
  sendFixedReply.mockClear();
  vi.doMock("@/lib/supabase/server", () => ({ requireUser: async () => ({ user: user ? { id: user } : null }), adminClient: () => db }));
  vi.doMock("@/lib/supabase/admin", () => ({ adminClient: () => db }));
  vi.doMock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true, retryAfter: 60 }) }));
  vi.doMock("@/lib/whatsapp/client", () => ({ sendTemplate, sendFixedReply }));
  vi.doMock("@/lib/admin/alerts", () => ({ adminAlert: vi.fn(async () => true) }));
}
const json = (body: unknown) => new Request("http://localhost:3000/api/whatsapp/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("WhatsApp routes need a session", () => {
  it.each([
    ["verify/start", () => import("@/app/api/whatsapp/verify/start/route")],
    ["verify/confirm", () => import("@/app/api/whatsapp/verify/confirm/route")],
    ["disconnect", () => import("@/app/api/whatsapp/disconnect/route")],
  ])("%s returns 401 signed out", async (_n, mod) => {
    await load(seed(), null);
    const res = await (await mod()).POST(json({ phone: "9876543210", consent: true, code: "123456" }));
    expect(res.status).toBe(401);
  });
});

describe("verification", () => {
  it("a free user can't start, even calling the API directly", async () => {
    const db = seed("free");
    await load(db, U1);
    const { POST } = await import("@/app/api/whatsapp/verify/start/route");
    const res = await POST(json({ phone: "9876543210", consent: true }));
    expect(res.status).toBe(403);
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(db.tables.whatsapp_contacts ?? []).toEqual([]);
  });

  it("needs the consent tick", async () => {
    await load(seed(), U1);
    const { POST } = await import("@/app/api/whatsapp/verify/start/route");
    expect((await POST(json({ phone: "9876543210", consent: false }))).status).toBe(400);
  });

  it("refuses a number verified on another account with 409", async () => {
    const db = seed();
    db.tables.whatsapp_contacts = [{ user_id: U2, phone_e164: "+919876543210", status: "verified", consent_at: "x", consent_version: "v1" }];
    await load(db, U1);
    const { POST } = await import("@/app/api/whatsapp/verify/start/route");
    expect((await POST(json({ phone: "98765 43210", consent: true }))).status).toBe(409);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("sends a code, stores only its hash, then verifies on the right code", async () => {
    const db = seed();
    await load(db, U1);
    const start = (await import("@/app/api/whatsapp/verify/start/route")).POST;
    expect((await start(json({ phone: "98765 43210", consent: true }))).status).toBe(200);
    const sent = (sendTemplate.mock.calls[0] as unknown as [string, { body: string[] }]);
    expect(sent[0]).toBe("+919876543210");
    const code = sent[1].body[0];
    expect(code).toMatch(/^\d{6}$/);
    const otp = db.tables.whatsapp_otps[0];
    expect(JSON.stringify(otp)).not.toContain(`"${code}"`);
    expect(otp.code_hash).toBe(hashCode(U1, code));
    expect(db.tables.whatsapp_contacts[0]).toMatchObject({ status: "pending", consent_version: "wa-consent-v1" });

    const confirm = (await import("@/app/api/whatsapp/verify/confirm/route")).POST;
    expect((await confirm(json({ code }))).status).toBe(200);
    expect(db.tables.whatsapp_contacts[0]).toMatchObject({ status: "verified", paused: false, opted_out_at: null });
    expect(db.tables.alert_settings[0].channels).toEqual(["telegram", "whatsapp"]);
    expect(db.tables.whatsapp_otps).toEqual([]);
  });

  it("locks after three wrong codes, even if the fourth is right", async () => {
    const db = seed();
    await load(db, U1);
    await (await import("@/app/api/whatsapp/verify/start/route")).POST(json({ phone: "9876543210", consent: true }));
    const code = (sendTemplate.mock.calls[0] as unknown as [string, { body: string[] }])[1].body[0];
    const wrong = code === "000000" ? "111111" : "000000";
    const confirm = (await import("@/app/api/whatsapp/verify/confirm/route")).POST;
    for (let i = 0; i < 3; i++) expect((await confirm(json({ code: wrong }))).status).toBe(400);
    const res = await confirm(json({ code }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("locked");
    expect(db.tables.whatsapp_contacts[0].status).toBe("pending");
  });
});

describe("webhook", () => {
  const SECRET = "app-secret";
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
  });
  const signed = (payload: unknown, secret = SECRET) => {
    const body = JSON.stringify(payload);
    return new Request("http://localhost:3000/api/whatsapp/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` },
      body,
    });
  };
  const inbound = (id: string, text: string) => ({ entry: [{ changes: [{ value: { messages: [{ from: "919876543210", id, type: "text", text: { body: text } }] } }] }] });
  const status = (id: string, s: string, pricing?: unknown) => ({ entry: [{ changes: [{ value: { statuses: [{ id, status: s, pricing, errors: s === "failed" ? [{ code: 131026 }] : undefined }] } }] }] });
  const verified = () => {
    const db = seed();
    db.tables.whatsapp_contacts = [{ user_id: U1, phone_e164: "+919876543210", status: "verified", consent_at: "x", consent_version: "v1", opted_out_at: null, paused: false, fail_streak: 0, last_auto_reply_at: null }];
    return db;
  };

  it("a forged call gets 401 and changes nothing", async () => {
    const db = verified();
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const res = await POST(signed(inbound("m1", "STOP"), "wrong-secret"));
    expect(res.status).toBe(401);
    expect(db.tables.whatsapp_contacts[0].opted_out_at).toBeNull();
    expect(db.tables.wa_inbound ?? []).toEqual([]);
  });

  it("STOP opts out at once with one confirmation; a repeated delivery is ignored", async () => {
    const db = verified();
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    await POST(signed(inbound("m1", "stop")));
    await POST(signed(inbound("m1", "stop")));
    expect(db.tables.whatsapp_contacts[0].opted_out_at).toBeTruthy();
    expect(sendFixedReply).toHaveBeenCalledTimes(1);
    expect(sendFixedReply.mock.calls[0]).toEqual(expect.arrayContaining(["+919876543210", "stop_confirm"]));
    expect(db.tables.wa_inbound).toHaveLength(1);
    expect(db.tables.wa_inbound[0].phone_hash).not.toContain("9876543210");
  });

  it("START opts back in when the plan allows", async () => {
    const db = verified();
    db.tables.whatsapp_contacts[0].opted_out_at = "2026-10-18T00:00:00Z";
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    await POST(signed(inbound("m2", "START")));
    expect(db.tables.whatsapp_contacts[0].opted_out_at).toBeNull();
  });

  it("START does nothing for a student whose plan no longer has WhatsApp", async () => {
    const db = verified();
    db.tables.users[0].plan = "free";
    db.tables.whatsapp_contacts[0].opted_out_at = "2026-10-18T00:00:00Z";
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    await POST(signed(inbound("m3", "start")));
    expect(db.tables.whatsapp_contacts[0].opted_out_at).toBe("2026-10-18T00:00:00Z");
  });

  it("other text gets one fixed auto-reply per 24 hours", async () => {
    const db = verified();
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    await POST(signed(inbound("m4", "how do I change my city?")));
    await POST(signed(inbound("m5", "hello?")));
    expect(sendFixedReply).toHaveBeenCalledTimes(1);
    expect(sendFixedReply.mock.calls[0]).toEqual(expect.arrayContaining(["auto_reply"]));
    expect(db.tables.wa_inbound).toHaveLength(2);
  });

  it("an unknown number is stored but never answered", async () => {
    const db = seed();
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    await POST(signed(inbound("m6", "hi")));
    expect(sendFixedReply).not.toHaveBeenCalled();
  });

  it("statuses update the message and its cost; three failures in a row pause WhatsApp; delivered resets the streak", async () => {
    const db = verified();
    db.tables.wa_messages = ["w1", "w2", "w3", "w4"].map((id) => ({ id, user_id: U1, kind: "digest", meta_message_id: id, status: "sent", category: "utility", send_date: id }));
    await load(db, null);
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    await POST(signed(status("w1", "delivered", { billable: true, category: "utility" })));
    expect(db.tables.wa_messages[0]).toMatchObject({ status: "delivered", billable: true, cost_inr: 0.1357 });
    await POST(signed(status("w1", "delivered"))); // duplicate event: ignored
    for (const id of ["w2", "w3"]) await POST(signed(status(id, "failed")));
    expect(db.tables.whatsapp_contacts[0]).toMatchObject({ fail_streak: 2, paused: false });
    await POST(signed(status("w3", "failed"))); // duplicate failure doesn't count twice
    expect(db.tables.whatsapp_contacts[0].fail_streak).toBe(2);
    await POST(signed(status("w4", "failed")));
    expect(db.tables.whatsapp_contacts[0]).toMatchObject({ fail_streak: 3, paused: true });
  });

  it("answers Meta's subscription check only with the right verify token", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "tok";
    await load(seed(), null);
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const ok = await GET(new Request("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42"));
    expect(await ok.text()).toBe("42");
    expect((await GET(new Request("http://x/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"))).status).toBe(403);
  });
});

describe("client.ts guards", () => {
  beforeEach(() => vi.resetModules());
  it("sends nothing when the switch is off or the cap is reached", async () => {
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "p";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const [flag, cap, reason] of [[false, true, "switch_off"], [true, false, "cap"]] as const) {
      vi.resetModules();
      vi.doUnmock("@/lib/whatsapp/client");
      vi.doMock("@/lib/admin/flags", () => ({ getFlag: async () => flag }));
      vi.doMock("@/lib/admin/spend", () => ({ canSpend: async () => ({ ok: cap }) }));
      const { sendTemplate: real } = await import("@/lib/whatsapp/client");
      const res = await real("+919876543210", { template: "gf_verify", body: ["123456"], buttons: ["123456"] }, {} as never);
      expect(res).toMatchObject({ ok: false, reason });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
