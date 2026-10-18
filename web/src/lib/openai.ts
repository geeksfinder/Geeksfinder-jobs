import { z } from "zod";
import { untrusted } from "./ai";
import { ArticleSchema, STYLE, type ArticleDraft } from "./articles";

/**
 * OpenAI writer (Chat Completions, Structured Outputs). Plain fetch, no SDK.
 * Model is configurable; keep it small — articles are short and capped at a few a day.
 */
const MODEL = process.env.OPENAI_ARTICLE_MODEL ?? "gpt-5-mini";

// Structured Outputs (strict) wants a plain JSON Schema with every property required and no extra keys
const { $schema: _drop, ...SCHEMA } = z.toJSONSchema(ArticleSchema) as Record<string, unknown>;
void _drop;

// Reasoning models take reasoning_effort/max_completion_tokens; older chat models reject reasoning_effort
const isReasoningModel = (m: string) => /^(gpt-5|o\d)/.test(m);

export async function writeWithOpenAI(headline: string, facts: string, revise = ""): Promise<ArticleDraft | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(180_000),
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: STYLE },
        { role: "user", content: `Write a GeeksFinder article about: ${JSON.stringify(headline)}.${revise}\n\n${untrusted("facts", facts, 20000)}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "article", strict: true, schema: SCHEMA } },
      max_completion_tokens: 16000,
      ...(isReasoningModel(MODEL) ? { reasoning_effort: "low" } : {}),
    }),
  }).catch((e) => {
    console.error("[openai] request failed", (e as Error).message);
    return null;
  });
  if (!res) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Never log the key; status + OpenAI's message is enough to act on
    console.error(`[openai] API error ${res.status}: ${data?.error?.message ?? "unknown"}`);
    return null;
  }
  const choice = data.choices?.[0];
  if (choice?.message?.refusal) {
    console.warn("[openai] refusal");
    return null;
  }
  if (choice?.finish_reason === "length") {
    console.warn("[openai] hit the token limit; skipping cluster");
    return null;
  }
  try {
    return JSON.parse(choice?.message?.content ?? "null");
  } catch {
    console.warn("[openai] reply wasn't valid JSON; skipping cluster");
    return null;
  }
}
