import { afterEach, describe, expect, it, vi } from "vitest";
import { mapLimit } from "@/lib/pool";

describe("sending alerts a few at a time", () => {
  it("never runs more than the limit at once and keeps results in order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
  });
  it("one failure doesn't stop the others", async () => {
    const out = await mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("telegram down");
      return n;
    });
    expect(out[0]).toBe(1);
    expect(out[1]).toBeInstanceOf(Error);
    expect(out[2]).toBe(3);
  });
  it("handles an empty list", async () => {
    expect(await mapLimit([], 5, async () => 1)).toEqual([]);
  });
});

describe("AI during the 7:30 rush", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  const setup = (statuses: number[]) => {
    process.env.GEMINI_API_KEY = "test";
    process.env.GEMINI_MODELS = "model-a";
    process.env.GROQ_API_KEY = "test";
    process.env.AI_BUSY_WAITS_MS = "1,1";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const status = statuses[calls.length] ?? 500;
      calls.push(String(url).includes("groq") ? "groq" : "gemini");
      const body = String(url).includes("groq") ? { choices: [{ message: { content: "groq answer" } }] } : { candidates: [{ content: { parts: [{ text: "gemini answer" }] } }] };
      return new Response(JSON.stringify(body), { status });
    });
    return calls;
  };

  it("waits and tries again when every provider is busy, instead of failing", async () => {
    // Round 1: Gemini 429, Groq 429. Round 2: Gemini answers.
    const calls = setup([429, 429, 200]);
    const { generate } = await import("@/lib/ai");
    expect(await generate("hello")).toBe("gemini answer");
    expect(calls).toEqual(["gemini", "groq", "gemini"]);
  });
  it("gives up after the last wait", async () => {
    const calls = setup([429, 429, 503, 503, 429, 429]);
    const { generate } = await import("@/lib/ai");
    await expect(generate("hello")).rejects.toThrow(/Groq 429/);
    expect(calls).toHaveLength(6);
  });
  it("doesn't retry a real error", async () => {
    const calls = setup([429, 400]);
    const { generate } = await import("@/lib/ai");
    await expect(generate("hello")).rejects.toThrow(/Groq 400/);
    expect(calls).toHaveLength(2);
  });
});
