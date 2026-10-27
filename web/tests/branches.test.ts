import { describe, expect, it } from "vitest";
import { BRANCHES, fetchSearches } from "@/lib/branches";
import { inIndia } from "@/lib/cities";
import { countHubs, parseHub } from "@/lib/hubs";

describe("morning fetch searches", () => {
  it("runs every branch's searches, mixed so each run covers several branches", () => {
    const q = fetchSearches(["Frontend Developer"], {});
    expect(q[0]).toBe("frontend developer fresher");
    // The first few searches already span several branches, not one
    expect(q.slice(0, 8)).toEqual(expect.arrayContaining(["software engineer fresher", "electronics engineer fresher", "mechanical engineer fresher", "civil engineer fresher"]));
    for (const b of BRANCHES) for (const s of b.searches) expect(q).toContain(s);
    expect(q).not.toContain("vlsi design engineer fresher");
  });
  it("adds a branch's extra searches once it has students, without repeats", () => {
    const q = fetchSearches(["VLSI Engineer", "Software Engineer"], { entc: 1 });
    expect(q).toContain("vlsi design engineer fresher");
    expect(q).toContain("vlsi engineer fresher");
    expect(new Set(q).size).toBe(q.length);
  });
});

describe("India check for job locations", () => {
  it("knows Indian cities, aliases and industrial towns", () => {
    for (const loc of ["Bengaluru, Karnataka", "Bangalore, IND", "Gurgaon", "Chakan, Pune", "Hosur", "Mumbai, Maharashtra, India", "India"]) expect(inIndia(loc)).toBe(true);
  });
  it("doesn't take Indiana or other countries for India", () => {
    for (const loc of ["Indianapolis, IN", "Louisville, Indiana", "Remote - US", "Berlin, Germany", "", null]) expect(inIndia(loc)).toBe(false);
  });
});

describe("branch job pages", () => {
  const jobs = [
    { title: "Graduate Engineer Trainee - Mechanical", location: "Pune, Maharashtra", remote: false },
    { title: "Site Engineer (Civil)", location: "Mumbai", remote: false },
    { title: "Embedded Software Engineer", location: "Bengaluru", remote: false },
    { title: "Design Verification Engineer", location: "Hyderabad", remote: false },
    { title: "Site Reliability Engineer", location: "Pune", remote: false },
    { title: "UI Design Engineer", location: "Pune", remote: false },
  ];
  const counts = countHubs(jobs);
  it("counts core-branch jobs on their pages", () => {
    expect(counts.get("mechanical-engineer-fresher-jobs")).toBe(1);
    expect(counts.get("mechanical-engineer-fresher-pune")).toBe(1);
    expect(counts.get("graduate-engineer-trainee-fresher-jobs")).toBe(1);
    expect(counts.get("civil-engineer-fresher-jobs")).toBe(1);
    expect(counts.get("electronics-engineer-fresher-jobs")).toBe(2);
  });
  it("keeps software roles off the core pages", () => {
    // "Site Reliability Engineer" isn't a site engineer; "UI Design Engineer" isn't mechanical
    expect(counts.get("civil-engineer-fresher-pune")).toBeUndefined();
    expect(counts.get("mechanical-engineer-fresher-jobs")).toBe(1);
  });
  it("parses the new page addresses", () => {
    expect(parseHub("civil-engineer-fresher-mumbai")?.role?.name).toBe("Civil Engineering");
    expect(parseHub("electronics-engineer-fresher-jobs")?.city).toBeNull();
  });
});
