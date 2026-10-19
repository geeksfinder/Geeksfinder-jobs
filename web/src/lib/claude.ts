import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { canSpend } from "./admin/spend";
import { untrusted } from "./ai";
import { ArticleSchema, STYLE, type ArticleDraft } from "./articles";
import { adminClient } from "./supabase/admin";

/** Claude writer. The plan asks for the smallest Claude model that writes well enough (Claude Haiku). */
const MODEL = process.env.CLAUDE_ARTICLE_MODEL ?? "claude-haiku-5-5";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

// US$ per million tokens for MODEL; set to the current price list so the anthropic spend cap counts real money
const USD_PER_MTOK_IN = Number(process.env.CLAUDE_USD_PER_MTOK_IN ?? 1);
const USD_PER_MTOK_OUT = Number(process.env.CLAUDE_USD_PER_MTOK_OUT ?? 5);

async function recordCost(usage: { input_tokens: number; output_tokens: number }) {
  const usd = (usage.input_tokens * USD_PER_MTOK_IN + usage.output_tokens * USD_PER_MTOK_OUT) / 1_000_000;
  const { error } = await adminClient().rpc("bump_ai_usage", { p_provider: "anthropic", p_cost: usd });
  if (error) console.warn(`[claude] couldn't record cost: ${error.message}`);
}

export async function writeWithClaude(headline: string, facts: string, revise = "", system = STYLE): Promise<ArticleDraft | null> {
  // Monthly ₹ cap set by the owner in admin; at 100% the writer chain falls through to the free model
  if (!(await canSpend("anthropic")).ok) {
    console.warn("[claude] anthropic spend cap reached; skipping");
    return null;
  }
  try {
    const response = await anthropic().messages.parse({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "medium", format: zodOutputFormat(ArticleSchema) },
      system,
      messages: [
        {
          role: "user",
          content: `Write a GeeksFinder article about: ${JSON.stringify(headline)}.${revise}

${untrusted("facts", facts, 20000)}`,
        },
      ],
    });
    await recordCost(response.usage);
    if (response.stop_reason === "refusal") {
      console.warn("[claude] refusal", response.stop_details?.category ?? "");
      return null;
    }
    if (response.stop_reason === "max_tokens") {
      console.warn("[claude] hit max_tokens; skipping cluster");
      return null;
    }
    return response.parsed_output ?? null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn("[claude] rate limited");
    else if (e instanceof Anthropic.APIError) console.error(`[claude] API error ${e.status}`);
    else throw e;
    return null;
  }
}
