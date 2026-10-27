import { describe, expect, it } from "vitest";
import { ProfileBody, fitParsedProfile, profileIssueText } from "@/lib/validate";

const base = { name: "Priya", phone: "", skills: ["SolidWorks"], preferred_roles: [], locations: ["Pune"], job_type: "both", experience_level: "fresher", projects: [], experience: [] };

describe("profile save", () => {
  it("accepts education years and scores the way resumes write them", () => {
    const education = [{ institution: "COEP", degree: "B.Tech Mechanical", year: "2021 – 2025 (Expected)", score: "CGPA 8.5/10 (till 6th sem)" }];
    expect(ProfileBody.safeParse({ ...base, education }).success).toBe(true);
  });
  it("names the field in plain words when something is too long", () => {
    const r = ProfileBody.safeParse({ ...base, education: [{ institution: "x", degree: "y", year: "9".repeat(41) }] });
    expect(r.success).toBe(false);
    expect(profileIssueText(r.error!.issues[0])).toBe("Education 1 year is too long. Keep it under 40 characters.");
    const p = ProfileBody.safeParse({ ...base, education: [], projects: [{ name: "n".repeat(121), description: "" }] });
    expect(profileIssueText(p.error!.issues[0])).toBe("Project 1 name is too long. Keep it under 120 characters.");
  });
  it("trims what the resume reader found, so the profile always saves", () => {
    const parsed = fitParsedProfile({
      education: [{ institution: "College", degree: "B.E.", year: "y".repeat(80), score: null }],
      projects: [{ name: "p".repeat(300), description: "d", tech: ["SolidWorks", 42, ""] }],
      experience: [{ company: "Bosch", role: "Intern", duration: "May – July 2024", bullets: ["b".repeat(900)] }],
    });
    expect(ProfileBody.safeParse({ ...base, ...parsed }).success).toBe(true);
    expect(parsed.projects[0].tech).toEqual(["SolidWorks", "42"]);
    expect(fitParsedProfile({}).education).toEqual([]);
  });
});

describe("branch on the profile", () => {
  it("accepts a known branch or none, nothing else", () => {
    expect(ProfileBody.safeParse({ ...base, education: [], branch: "mechanical" }).success).toBe(true);
    expect(ProfileBody.safeParse({ ...base, education: [], branch: null }).success).toBe(true);
    expect(ProfileBody.safeParse({ ...base, education: [] }).success).toBe(true);
    expect(ProfileBody.safeParse({ ...base, education: [], branch: "aero" }).success).toBe(false);
  });
});

describe("last date", () => {
  it("shows the notice's own date", async () => {
    const { lastDate } = await import("@/lib/format");
    expect(lastDate("2026-11-18")).toBe("Last date 18 Nov");
    expect(lastDate("not a date")).toBe("");
  });
});
