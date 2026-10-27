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
