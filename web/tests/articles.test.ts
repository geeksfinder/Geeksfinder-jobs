import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ rpc: async () => ({ data: [{ calls: 1 }], error: null }) }) }));
// Kill switches and spend caps have their own tests (admin.test.ts); here they are on and under cap
vi.mock("@/lib/admin/flags", () => ({ getFlag: async () => true }));
vi.mock("@/lib/admin/spend", () => ({ canSpend: async () => ({ ok: true, spent: 0, cap: null }) }));

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

describe("writer fallback", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());
  it("falls back to free Gemini when the paid key has no credit", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ARTICLE_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    process.env.GEMINI_API_KEY = "g";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "You have no credits remaining" } }), { status: 429 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), generateJSON: vi.fn().mockResolvedValue(good) }));
    const { writeArticle, providerChain } = await import("@/lib/articles");
    expect(providerChain()).toEqual(["openai", "gemini"]);
    expect(await writeArticle(cluster)).toEqual(good);
    vi.doUnmock("@/lib/ai");
    delete process.env.GEMINI_API_KEY;
  });
});

describe("skipping a failing writer", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());
  it("stops trying a no-credit writer after two failures in one run", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ARTICLE_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test-not-real";
    process.env.GEMINI_API_KEY = "g";
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "no credits" } }), { status: 429 }));
    vi.stubGlobal("fetch", f);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.doMock("@/lib/ai", async (orig) => ({ ...(await orig<typeof import("@/lib/ai")>()), generateJSON: vi.fn().mockResolvedValue(good) }));
    const { writeArticle, providerChain } = await import("@/lib/articles");
    for (let i = 0; i < 4; i++) expect(await writeArticle(cluster)).toEqual(good);
    expect(f).toHaveBeenCalledTimes(2);
    expect(providerChain()).toEqual(["gemini"]);
    vi.doUnmock("@/lib/ai");
    delete process.env.GEMINI_API_KEY;
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

describe("article checker", () => {
  it("doesn't read the end of one sentence and the start of the next as a name", async () => {
    const { unsupportedClaims } = await import("@/lib/article-checks");
    const facts = ["Naukri JobSpeak Index rose 2% in September", "IIT Roorkee hosted recruiters from Tata Consultancy Services"];
    const text = "Recruiters went to IIT Roorkee. As the season opened, the Naukri JobSpeak Index Data showed growth. Hiring rose at Tata Consultancy Services and at Infosys Limited. Students learn Node.js daily.";
    expect(unsupportedClaims(text, facts)).toEqual(['name "Infosys Limited"']);
  });

  it("treats degree, branch and tool names as general words, not claims", async () => {
    const { unsupportedClaims } = await import("@/lib/article-checks");
    const text = "If you study a B.Tech CSE or Computer Applications course, learn Power BI. Recruiters at Infosys Limited may ask.";
    expect(unsupportedClaims(text, ["Fresher jobs grew"])).toEqual(['name "Infosys Limited"']);
  });
});
