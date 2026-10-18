import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ rpc: async () => ({ data: [{ calls: 1 }], error: null }) }) }));

const good = {
  title: "TCS opens off-campus drive for 2026 graduates",
  summary: "TCS is hiring 2026 graduates off campus. Applications close on 30 October.",
  topic: "Hiring drives",
  body_md: "## What happened\nTCS opened applications.",
  freshers_note: "Apply early.",
  related_skills: ["Java", "SQL", "Python"],
  used_source_urls: ["https://example.com/tcs"],
};
const cluster = { headline: "TCS off-campus drive", facts: [{ fact: "TCS opened an off-campus drive", source_url: "https://example.com/tcs" }] };

function mockOpenAI(reply: Record<string, unknown>, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(reply), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const chat = (content: unknown, extra: Record<string, unknown> = {}) => ({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content), ...extra } }] });

describe("free Gemini writer", () => {
  beforeEach(() => vi.resetModules());
  it("re-validates Gemini's JSON and drops anything off-shape", async () => {
    vi.doMock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), generateJSON: vi.fn().mockResolvedValueOnce(good).mockResolvedValueOnce({ title: "only a title" }) }));
    process.env.ARTICLE_PROVIDER = "gemini";
    const { writeArticle } = await import("@/lib/articles");
    expect(await writeArticle(cluster)).toEqual(good);
    expect(await writeArticle(cluster)).toBeNull();
    delete process.env.ARTICLE_PROVIDER;
    vi.doUnmock("@/lib/ai");
  });
});

describe("blog writer provider", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ARTICLE_PROVIDER;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    process.env.OPENAI_API_KEY = "sk-test-not-real";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses Claude, then OpenAI, then the free Gemini tier, then nothing", async () => {
    const { articleProvider } = await import("@/lib/articles");
    expect(articleProvider()).toBe("openai");
    process.env.ANTHROPIC_API_KEY = "x";
    expect(articleProvider()).toBe("claude");
    process.env.ARTICLE_PROVIDER = "openai";
    expect(articleProvider()).toBe("openai");
    delete process.env.ARTICLE_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.GEMINI_API_KEY = "g";
    expect(articleProvider()).toBe("gemini");
    delete process.env.GEMINI_API_KEY;
    expect(articleProvider()).toBeNull();
  });

  it("asks OpenAI for strict structured output and keeps facts in the untrusted block", async () => {
    const f = mockOpenAI(chat(good));
    const { writeArticle } = await import("@/lib/articles");
    expect(await writeArticle(cluster)).toEqual(good);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
    expect(body.response_format.json_schema.schema.$schema).toBeUndefined();
    expect(body.messages[1].content).toContain("<untrusted_facts>");
  });

  it("skips refusals, truncated replies and drafts with the wrong shape", async () => {
    const { writeArticle } = await import("@/lib/articles");
    mockOpenAI(chat(null, { refusal: "I can't help with that" }));
    expect(await writeArticle(cluster)).toBeNull();
    mockOpenAI({ choices: [{ finish_reason: "length", message: { content: "{" } }] });
    expect(await writeArticle(cluster)).toBeNull();
    mockOpenAI(chat({ ...good, topic: "Celebrity gossip" }));
    expect(await writeArticle(cluster)).toBeNull();
  });

  it("never logs the API key on errors", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    mockOpenAI({ error: { message: "Incorrect API key provided" } }, 401);
    const { writeArticle } = await import("@/lib/articles");
    expect(await writeArticle(cluster)).toBeNull();
    expect(err.mock.calls.flat().join(" ")).not.toContain("sk-test-not-real");
    err.mockRestore();
  });
});
