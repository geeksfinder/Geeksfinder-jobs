import { z } from "zod";
import { generateJSON, untrusted } from "./ai";
import { ArticleSchema, STYLE, type ArticleDraft } from "./articles";

/**
 * Free writer: Gemini's free tier (Groq's free tier as fallback) via the same helper the job pipeline uses.
 * No structured-output guarantee here, so the JSON shape is spelled out and articles.ts re-validates the reply.
 */
const { $schema: _drop, ...SHAPE } = z.toJSONSchema(ArticleSchema) as Record<string, unknown>;
void _drop;

export async function writeWithGemini(headline: string, facts: string, revise = "", system = STYLE): Promise<ArticleDraft | null> {
  const prompt = `${system}

Write a GeeksFinder article about: ${JSON.stringify(headline)}.${revise}
Reply with ONE JSON object only (no Markdown fences, no commentary) matching this JSON Schema; follow each field's description:
${JSON.stringify(SHAPE)}

${untrusted("facts", facts, 20000)}`;
  try {
    return await generateJSON<ArticleDraft>(prompt);
  } catch (e) {
    console.warn("[gemini-writer] no usable draft:", (e as Error).message.slice(0, 160));
    return null;
  }
}
