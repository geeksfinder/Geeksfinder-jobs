import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auth on every API route: calling without a session returns 401.
 * IDOR: lookups are filtered by the signed-in owner, so another user's id returns 404.
 */
const state: { user: { id: string; email?: string } | null; filters: [string, unknown][] } = { user: null, filters: [] };

function fakeQuery() {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "order", "limit", "is", "in", "gte", "update", "upsert", "insert", "delete"]) q[m] = () => q;
  q.eq = (col: string, val: unknown) => { state.filters.push([col, val]); return q; };
  q.maybeSingle = async () => ({ data: null });
  q.single = async () => ({ data: null });
  return q;
}
const supabase = { from: () => fakeQuery(), storage: { from: () => ({ upload: async () => ({}) }) }, auth: { signOut: async () => ({}) } };

vi.mock("@/lib/supabase/server", () => ({
  requireUser: async () => ({ supabase, user: state.user }),
  createClient: async () => supabase,
  adminClient: () => supabase,
}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => supabase }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ getAll: () => [], set: () => {} }) }));

beforeEach(() => { state.user = null; state.filters = []; });

const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const JOB = "3f1c2b9e-8a4d-4c2b-9f1e-2a3b4c5d6e7f";

describe("every user API route requires a session", () => {
  const cases: [string, () => Promise<{ POST?: (r: Request, ctx?: never) => Promise<Response>; GET?: (r: Request, ctx: never) => Promise<Response> }>, unknown][] = [
    ["/api/tailor", () => import("@/app/api/tailor/route"), { jobId: JOB }],
    ["/api/outreach", () => import("@/app/api/outreach/route"), { jobId: JOB }],
    ["/api/cover-letter", () => import("@/app/api/cover-letter/route"), { jobId: JOB }],
    ["/api/outreach/sent", () => import("@/app/api/outreach/sent/route"), { jobId: JOB, channel: "email" }],
    ["/api/account/delete", () => import("@/app/api/account/delete/route"), {}],
    ["/api/razorpay/subscribe", () => import("@/app/api/razorpay/subscribe/route"), {}],
    ["/api/razorpay/cancel", () => import("@/app/api/razorpay/cancel/route"), {}],
  ];
  it.each(cases)("%s → 401 without a cookie", async (_name, load, body) => {
    const mod = await load();
    const res = await (mod.POST as (r: Request) => Promise<Response>)(json(body));
    expect(res.status).toBe(401);
  });

  it("/api/resume/parse → 401 without a cookie", async () => {
    const { POST } = await import("@/app/api/resume/parse/route");
    const res = await POST(new Request("http://localhost/api/resume/parse", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(401);
  });

  it("/api/tailor/[id]/pdf → 401 without a cookie", async () => {
    const { GET } = await import("@/app/api/tailor/[id]/pdf/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: JOB }) });
    expect(res.status).toBe(401);
  });
});

describe("IDOR", () => {
  it("tailored PDF lookup is filtered by the signed-in owner, so another user's id is a 404", async () => {
    state.user = { id: "user-a" };
    const { GET } = await import("@/app/api/tailor/[id]/pdf/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: JOB }) });
    expect(res.status).toBe(404);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("rejects non-UUID ids outright", async () => {
    state.user = { id: "user-a" };
    const { GET } = await import("@/app/api/tailor/[id]/pdf/route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
  });
});

describe("cover letters", () => {
  const patch = (body: unknown) => new Request("http://localhost/api", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  it("editing and the PDF need a session", async () => {
    const { PATCH } = await import("@/app/api/cover-letter/route");
    expect((await PATCH(patch({ jobId: JOB, body: "x".repeat(60) }))).status).toBe(401);
    const { GET } = await import("@/app/api/cover-letter/[id]/pdf/route");
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: JOB }) })).status).toBe(401);
  });
  it("is written only from the student's own tailored resume, so an untailored job is refused", async () => {
    state.user = { id: "user-a" };
    const { POST } = await import("@/app/api/cover-letter/route");
    const res = await POST(json({ jobId: JOB }));
    expect(res.status).toBe(409);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });
  it("edits and PDFs only touch the signed-in student's letter", async () => {
    state.user = { id: "user-a" };
    const { PATCH } = await import("@/app/api/cover-letter/route");
    expect((await PATCH(patch({ jobId: JOB, body: "Dear Hiring Manager, ".repeat(4) }))).status).toBe(404);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
    state.filters = [];
    const { GET } = await import("@/app/api/cover-letter/[id]/pdf/route");
    expect((await GET(new Request("http://localhost"), { params: Promise.resolve({ id: JOB }) })).status).toBe(404);
    expect(state.filters).toContainEqual(["user_id", "user-a"]);
  });
  it("refuses an empty letter", async () => {
    state.user = { id: "user-a" };
    const { PATCH } = await import("@/app/api/cover-letter/route");
    expect((await PATCH(patch({ jobId: JOB, body: "too short" }))).status).toBe(400);
  });
});

describe("never trust the frontend", () => {
  it("tailor ignores extra fields like plan in the body (schema-validated)", async () => {
    state.user = { id: "user-a" };
    const { POST } = await import("@/app/api/tailor/route");
    const res = await POST(json({ jobId: "not-a-uuid", plan: "pro" }));
    expect(res.status).toBe(400);
  });
});
