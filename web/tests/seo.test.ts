import { describe, expect, it } from "vitest";
import { allHubs, countHubs, hubName, parseHub } from "@/lib/hubs";
import { articleSchema, fitTitle } from "@/lib/seo";

describe("job hubs", () => {
  it("parses all three levels and rejects unknown slugs", () => {
    expect(parseHub("react-developer-fresher-bengaluru")).toMatchObject({ role: { slug: "react-developer" }, city: { slug: "bengaluru" } });
    expect(parseHub("internship-fresher-jobs")).toMatchObject({ role: { slug: "internship" }, city: null });
    expect(parseHub("fresher-jobs-delhi-ncr")).toMatchObject({ role: null, city: { slug: "delhi-ncr" } });
    expect(parseHub("fresher-jobs-atlantis")).toBeNull();
    expect(parseHub("astronaut-fresher-jobs")).toBeNull();
    expect(parseHub("react-developer-fresher-atlantis")).toBeNull();
  });

  it("every hub slug round-trips and is unique", () => {
    const slugs = allHubs().map((h) => h.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(parseHub(s)?.slug).toBe(s);
  });

  it("names hubs the way students search", () => {
    expect(hubName(parseHub("react-developer-fresher-bengaluru")!)).toBe("React Developer fresher jobs in Bengaluru");
    expect(hubName(parseHub("fresher-jobs-remote")!)).toBe("Remote fresher jobs");
    expect(hubName(parseHub("internship-fresher-jobs")!)).toBe("Internships and trainee jobs in India");
    expect(hubName(parseHub("sales-marketing-fresher-pune")!)).toBe("Sales and marketing fresher jobs in Pune");
  });

  it("counts a job in its role, city and role-in-city hubs", () => {
    const c = countHubs([
      { title: "Software Engineer Intern", location: "Bangalore, Karnataka", remote: false },
      { title: "Inside Sales Associate", location: "Remote", remote: true },
      { title: "Salesforce Developer", location: "Pune", remote: false },
    ]);
    expect(c.get("fresher-jobs-bengaluru")).toBe(1);
    expect(c.get("software-engineer-fresher-jobs")).toBe(1);
    expect(c.get("internship-fresher-bengaluru")).toBe(1);
    expect(c.get("sales-marketing-fresher-remote")).toBe(1);
    // "sales" inside "Salesforce" is not a sales job
    expect(c.get("sales-marketing-fresher-pune")).toBeUndefined();
  });
});

describe("titles fit in search results", () => {
  it("keeps the brand suffix when it fits", () => {
    expect(fitTitle("Fresher jobs in Bengaluru (Updated Daily)")).toBe("Fresher jobs in Bengaluru (Updated Daily)");
  });
  it("falls back to the short form, then drops the suffix, then cuts at a word", () => {
    expect(fitTitle("React Developer fresher jobs in Bengaluru (Updated Daily)", "React Developer fresher jobs in Bengaluru")).toBe("React Developer fresher jobs in Bengaluru");
    expect(fitTitle("Building a one-page resume when you have no work experience")).toEqual({ absolute: "Building a one-page resume when you have no work experience" });
    const long = fitTitle("How to prepare for an off-campus drive when your college has no placement cell at all");
    expect(typeof long === "object" && long.absolute.length).toBeLessThanOrEqual(60);
    expect(typeof long === "object" && long.absolute.endsWith("…")).toBe(true);
  });
});

describe("article schema", () => {
  const base = { title: "T", slug: "t", summary: "S", published_at: "2026-10-18T00:00:00Z", reviewer: "Asha Rao" };
  it("guides are Articles, news is NewsArticle", () => {
    expect(articleSchema({ ...base, kind: "guide" })["@type"]).toBe("Article");
    expect(articleSchema({ ...base, kind: "news" })["@type"]).toBe("NewsArticle");
  });
  it("names a human editor only when a person approved it", () => {
    expect(articleSchema({ ...base, auto_published: false })).toHaveProperty("editor.name", "Asha Rao");
    expect(articleSchema({ ...base, auto_published: true })).not.toHaveProperty("editor");
  });
  it("uses the real modified date", () => {
    expect(articleSchema({ ...base, updated_at: "2026-10-20T00:00:00Z" }).dateModified).toBe("2026-10-20T00:00:00Z");
  });
});

describe("hub answers for AI search", () => {
  it("states the live count, this week's count, top skills and the date, and the FAQ says the same", async () => {
    const { hubAnswer } = await import("@/lib/hubs");
    const stats = { total: 42, thisWeek: 12, skills: [["Python", 18], ["SQL", 12], ["Excel", 9], ["Git", 4]] as [string, number][], companies: [["Bosch", 6], ["Wabtec", 4]] as [string, number][] };
    const a = hubAnswer("Data Analyst fresher jobs in Pune", stats, Date.UTC(2026, 9, 28, 1, 0));
    expect(a.summary).toBe("42 live openings, 12 posted this week. Most asked skills: Python, SQL and Excel. Updated 28 Oct 2026.");
    expect(a.faq.map((f) => f.q)).toEqual(["How many Data Analyst fresher jobs in Pune are open right now?", "Which skills do companies ask for most?", "Which companies are hiring?"]);
    expect(a.faq[0].a).toContain("42 live openings");
    expect(a.faq[2].a).toBe("Bosch and Wabtec have the most openings here this week.");
  });
  it("has no FAQ for an empty page", async () => {
    const { hubAnswer } = await import("@/lib/hubs");
    expect(hubAnswer("Remote fresher jobs", { total: 0, thisWeek: 0, skills: [], companies: [] }).faq).toEqual([]);
    expect(hubAnswer("Fresher jobs in Pune", { total: 3, thisWeek: 1, skills: [], companies: [] }).faq[0].q).toBe("How many fresher jobs in Pune are open right now?");
  });
});
