import { afterEach, describe, expect, it } from "vitest";
import { canAutoPublish, seoReview, titleSimilarity, type AiReview } from "@/lib/article-review";

const body = [
  "Off-campus hiring for freshers is picking up, and the drive below is open to 2026 graduates.",
  "## What the drive offers",
  "Short paragraph about roles.",
  "## Who can apply",
  "Short paragraph about eligibility.",
  "## How to prepare",
  "Short paragraph about preparation.",
].join("\n\n");
const draft = {
  title: "Off-campus hiring drive opens for 2026 fresher graduates",
  summary: "A new off-campus drive is open to 2026 graduates. Here is who can apply, the roles on offer and how to prepare before the test.",
  topic: "Hiring drives" as const,
  body_md: body,
  freshers_note: "Apply early.",
  related_skills: ["Java"],
  used_source_urls: [],
};
const good: AiReview = { helpfulness: 8, reads_natural: 8, accuracy_risk: "low", issues: [] };
const passing = { passed: true, notes: [] };

describe("SEO reviewer", () => {
  it("passes a well-shaped draft", () => {
    expect(seoReview(draft, []).notes).toEqual([]);
  });
  it("flags a long title, a short summary and too few subheadings", () => {
    const r = seoReview({ ...draft, title: "x".repeat(80), summary: "Too short.", body_md: "Intro.\n\n## One" }, []);
    expect(r.notes.join(" ")).toMatch(/Title is 80/);
    expect(r.notes.join(" ")).toMatch(/Summary is/);
    expect(r.notes.join(" ")).toMatch(/subheadings/);
  });
  it("catches a reworded duplicate of an existing article", () => {
    expect(titleSimilarity("Off-campus hiring drive opens for 2026 fresher graduates", "2026 fresher graduates: off-campus hiring drive opens")).toBeGreaterThanOrEqual(0.75);
    expect(seoReview(draft, ["2026 fresher graduates: off-campus hiring drive opens"]).notes.join(" ")).toMatch(/Too similar/);
  });
});

describe("auto-publish gate", () => {
  afterEach(() => { delete process.env.AUTO_PUBLISH; });
  it("publishes only when every reviewer passes", () => {
    expect(canAutoPublish(passing, { score: 100, notes: [] }, good).publish).toBe(true);
  });
  it("holds the draft for any single failure", () => {
    expect(canAutoPublish({ passed: false, notes: ["Shares 9 words"] }, { score: 100, notes: [] }, good).publish).toBe(false);
    expect(canAutoPublish(passing, { score: 85, notes: ["Title is 70 characters"] }, good).publish).toBe(false);
    expect(canAutoPublish(passing, { score: 100, notes: [] }, { ...good, accuracy_risk: "medium" }).publish).toBe(false);
    expect(canAutoPublish(passing, { score: 100, notes: [] }, { ...good, helpfulness: 6 }).publish).toBe(false);
    expect(canAutoPublish(passing, { score: 100, notes: [] }, null).reasons.join(" ")).toMatch(/AI editor was unavailable/);
  });
  it("can be switched off", () => {
    process.env.AUTO_PUBLISH = "0";
    expect(canAutoPublish(passing, { score: 100, notes: [] }, good).publish).toBe(false);
  });
});
