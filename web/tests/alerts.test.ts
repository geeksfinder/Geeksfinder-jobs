import { describe, expect, it } from "vitest";
import { telegramAlertText, type AlertMatch } from "@/lib/alerts";

const job = (i: number, extra: Partial<AlertMatch["jobs"]> = {}): AlertMatch => ({
  score: 90 - i,
  jobs: { id: `j${i}`, title: `Frontend Developer Intern ${i}`, company: "Zepto Pvt Ltd", location: "Bengaluru", remote: false, apply_url: `https://jobs.lever.co/zepto/${i}`, fresher_friendly: true, ...extra },
});
const morning = Date.parse("2026-10-27T02:00:00Z"); // 7:30 IST

describe("Telegram alert as one message", () => {
  it("has the greeting, every match with its links, and nothing else for paid students", () => {
    const text = telegramAlertText({ name: "Priya Sharma", plan: "pro", matches: [job(1), job(2), job(3)], app: "https://gf.app" }, morning);
    expect(text).toMatch(/^<b>Good morning, Priya<\/b>\n3 new matches for you/);
    expect(text).toContain("1. <b>Frontend Developer Intern 1</b>\nZepto · Bengaluru · Fresher · <b>89% match</b>");
    expect(text).toContain('<a href="https://gf.app/apply/j2?tab=tailor">Tailor resume</a>');
    expect(text).toContain('<a href="https://jobs.lever.co/zepto/3">Apply</a>');
    expect(text).not.toMatch(/paid plan/);
  });

  it("adds the plan note for free students", () => {
    expect(telegramAlertText({ plan: "free", matches: [job(1)], app: "https://gf.app" }, morning)).toMatch(/Get alerts <b>daily<\/b>/);
  });

  it("escapes job text and can't be broken by a quote in a feed's link", () => {
    const text = telegramAlertText({ plan: "pro", matches: [job(1, { title: "<script>x</script> & co", apply_url: 'https://x.com/a"onclick="b' })], app: "https://gf.app" }, morning);
    expect(text).toContain("&lt;script&gt;x&lt;/script&gt; &amp; co");
    expect(text).toContain('href="https://x.com/a%22onclick=%22b"');
  });

  it("stays under Telegram's 4,096-character limit with many matches", () => {
    const many = Array.from({ length: 40 }, (_, i) => job(i, { title: "A very long job title for a fresher role ".repeat(2) }));
    const text = telegramAlertText({ plan: "free", matches: many, app: "https://gf.app" }, morning);
    expect(text.length).toBeLessThan(4096);
    expect(text).toMatch(/more in the app\./);
  });
});

describe("when an alert is due", () => {
  // 2 Nov 2026 is a Monday. IST = UTC + 5:30.
  const at = (h: number, m = 0, day = 2) => Date.UTC(2026, 10, day, h, m) - 5.5 * 3_600_000;
  const pro = { frequency: "daily", plan: "pro", alertHour: 14, lastSent: null };
  it("goes out on a late run after the alert time, not only inside that hour", async () => {
    const { alertDue } = await import("@/lib/alerts");
    expect(alertDue(pro, at(13, 59))).toBe(false);
    expect(alertDue(pro, at(14, 30))).toBe(true);
    expect(alertDue(pro, at(16, 41))).toBe(true);
  });
  it("goes out once a day", async () => {
    const { alertDue } = await import("@/lib/alerts");
    expect(alertDue({ ...pro, lastSent: new Date(at(14, 31)).toISOString() }, at(16, 41))).toBe(false);
    expect(alertDue({ ...pro, lastSent: new Date(at(14, 31, 1)).toISOString() }, at(14, 40))).toBe(true);
  });
  it("never twice within 20 hours, even after the alert time is changed", async () => {
    const { alertDue } = await import("@/lib/alerts");
    expect(alertDue({ ...pro, alertHour: 20, lastSent: new Date(at(7, 30)).toISOString() }, at(20, 30))).toBe(false);
  });
  it("sends free students weekly on Mondays, monthly on the 1st", async () => {
    const { alertDue } = await import("@/lib/alerts");
    expect(alertDue({ ...pro, plan: "free" }, at(14, 30))).toBe(true);
    expect(alertDue({ ...pro, plan: "free" }, at(14, 30, 3))).toBe(false);
    expect(alertDue({ ...pro, frequency: "monthly" }, at(14, 30, 1))).toBe(true);
    expect(alertDue({ ...pro, frequency: "monthly" }, at(14, 30))).toBe(false);
  });
});
