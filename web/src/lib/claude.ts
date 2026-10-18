import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { untrusted } from "./ai";
import { ArticleSchema, STYLE, type ArticleDraft } from "./articles";

/** Claude writer. The plan asks for the smallest Claude model that writes well enough (Claude Haiku). */
const MODEL = process.env.CLAUDE_ARTICLE_MODEL ?? "claude-haiku-5-5";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export async function writeWithClaude(headline: string, facts: string, revise = "", system = STYLE): Promise<ArticleDraft | null> {
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
