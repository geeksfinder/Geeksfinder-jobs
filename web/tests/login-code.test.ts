import { beforeEach, describe, expect, it, vi } from "vitest";
import { loginCodeEmail } from "@/lib/login-email";

function setup(opts: { code?: string | null; genError?: string; sendOk?: boolean; captchaOk?: boolean; signupsOn?: boolean } = {}) {
  vi.resetModules();
  const generateLink = vi.fn(async () =>
    opts.genError ? { data: null, error: { message: opts.genError } } : { data: { properties: { email_otp: opts.code === undefined ? "48213907" : opts.code } }, error: null },
  );
  const signInWithOtp = vi.fn(async () => ({ error: null }));
  const sendEmail = vi.fn(async () => opts.sendOk !== false);
  vi.doMock("@/lib/supabase/server", () => ({
    adminClient: () => ({ auth: { admin: { generateLink } } }),
    createClient: async () => ({ auth: { signInWithOtp } }),
  }));
  vi.doMock("@/lib/email", () => ({ sendEmail }));
  vi.doMock("@/lib/ratelimit", () => ({ rateLimit: async () => ({ ok: true, retryAfter: 60 }), clientIp: async () => "1.2.3.4" }));
  vi.doMock("@/lib/turnstile", () => ({ verifyTurnstile: async () => opts.captchaOk !== false }));
  vi.doMock("@/lib/admin/flags", () => ({ getFlag: async () => opts.signupsOn !== false }));
  return { generateLink, signInWithOtp, sendEmail };
}
const post = (body: unknown) => new Request("http://localhost:3000/api/auth/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("sign-in code email", () => {
  beforeEach(() => vi.resetModules());

  it("comes from GeeksFinder with the code, not Supabase's sign-in link", async () => {
    const m = setup();
    const { POST } = await import("@/app/api/auth/otp/route");
    const res = await POST(post({ email: "Priya@Example.com", turnstile: "t" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, digits: 8 });
    expect(m.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "priya@example.com" });
    const [to, subject, html] = m.sendEmail.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("priya@example.com");
    expect(subject).toBe("48213907 is your GeeksFinder code");
    expect(html).toContain("48213907");
    expect(html).not.toMatch(/https?:\/\//); // no link to click, just the code
    expect(m.signInWithOtp).not.toHaveBeenCalled();
  });

  it("falls back to Supabase's own email if Brevo can't send, so nobody is locked out", async () => {
    const m = setup({ sendOk: false });
    const { POST } = await import("@/app/api/auth/otp/route");
    expect((await POST(post({ email: "a@b.co", turnstile: "t" }))).status).toBe(200);
    expect(m.signInWithOtp).toHaveBeenCalledWith({ email: "a@b.co" });
  });

  it("still checks the bot challenge before creating a code", async () => {
    const m = setup({ captchaOk: false });
    const { POST } = await import("@/app/api/auth/otp/route");
    expect((await POST(post({ email: "a@b.co" }))).status).toBe(400);
    expect(m.generateLink).not.toHaveBeenCalled();
  });

  it("says so when sign-ups are paused", async () => {
    setup({ genError: "Database error saving new user", signupsOn: false });
    const { POST } = await import("@/app/api/auth/otp/route");
    const res = await POST(post({ email: "new@b.co", turnstile: "t" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Sign-ups are paused/);
  });

  it("escapes the code in the email", () => {
    expect(loginCodeEmail("<b>1</b>").html).not.toContain("<b>1</b>");
  });
});
