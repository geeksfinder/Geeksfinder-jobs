import { describe, expect, it } from "vitest";
import { boardJobCount, boardUrl, loadBoards } from "@/lib/boards";

const db = (rows: unknown, error: unknown = null) => ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error }) }) }) }) as never;

describe("company boards", () => {
  it("reads active boards from the table, grouped by provider", async () => {
    const r = await loadBoards(db([{ provider: "lever", slug: "cred" }, { provider: "smartrecruiters", slug: "BoschGroup" }, { provider: "unknown", slug: "x" }]), { lever: ["old"] });
    expect(r.from).toBe("database");
    expect(r.boards.lever).toEqual(["cred"]);
    expect(r.boards.smartrecruiters).toEqual(["BoschGroup"]);
  });
  it("falls back to boards.json while the table is empty or missing", async () => {
    expect((await loadBoards(db([]), { lever: ["cred"] })).from).toBe("boards.json");
    const missing = await loadBoards(db(null, { message: "relation does not exist" }), { greenhouse: ["groww"] });
    expect(missing).toEqual({ from: "boards.json", boards: { greenhouse: ["groww"], lever: [], ashby: [], smartrecruiters: [] } });
  });
  it("knows each provider's public job list and how it counts jobs", () => {
    expect(boardUrl("smartrecruiters", "BoschGroup")).toContain("/companies/BoschGroup/postings");
    expect(boardJobCount("greenhouse", { jobs: [1, 2] })).toBe(2);
    expect(boardJobCount("lever", [1, 2, 3])).toBe(3);
    expect(boardJobCount("smartrecruiters", { totalFound: 625 })).toBe(625);
    expect(boardJobCount("ashby", { error: "not found" })).toBeNull();
  });
});
