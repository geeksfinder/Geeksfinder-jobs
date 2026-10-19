import type { SupabaseClient } from "@supabase/supabase-js";
import { getFlag } from "./admin/flags";
import { slugify } from "./format";
import { renderMarkdown } from "./markdown";
import { SITE } from "./site";
import { esc, sendTelegram } from "./telegram";

type DraftFacts = { facts: { fact: string; source_url: string }[]; related_skills?: string[]; freshers_note?: string; used_source_urls?: string[] };

export type DraftRow = {
  id: string;
  kind?: string | null;
  cluster_id: string | null;
  title: string;
  summary: string | null;
  topic: string | null;
  body_md: string | null;
  facts: unknown;
};

/**
 * Publish a reviewed draft: article row, Telegram channel post, IndexNow ping. Shared by the admin Approve button
 * and the pipeline's auto-publish, so both follow exactly the same steps. Uses the service-role client.
 */
export async function publishDraft(admin: SupabaseClient, d: DraftRow, reviewer: string, reviewerId: string | null) {
  const facts = d.facts as DraftFacts;
  const used = new Set(facts.used_source_urls?.length ? facts.used_source_urls : facts.facts.map((f) => f.source_url));
  const { data: items } = d.cluster_id ? await admin.from("news_items").select("url, title").eq("cluster_id", d.cluster_id) : { data: [] };
  // Guides cite only GeeksFinder's own job data, and only when they used a number from it
  const sources =
    d.kind === "guide"
      ? [...used].filter((u) => facts.facts.some((f) => f.source_url === u)).map((url) => ({ url, title: "GeeksFinder live job listings" }))
      : (items ?? []).filter((i) => used.has(i.url)).map((i) => ({ url: i.url, title: i.title }));
  const slug = `${slugify(d.title)}-${new Date().toISOString().slice(0, 10)}`;

  const { data: article, error } = await admin
    .from("articles")
    .insert({
      draft_id: d.id,
      slug,
      title: d.title,
      summary: d.summary,
      topic: d.topic,
      body_html: renderMarkdown(d.body_md ?? ""),
      freshers_note: renderMarkdown(facts.freshers_note ?? ""),
      sources,
      reviewer_name: reviewer,
      related_skills: (facts.related_skills ?? []).slice(0, 8),
      kind: d.kind === "guide" ? "guide" : "news",
      // No person approved it: the byline says "GeeksFinder Desk" without a reviewer (editorial policy)
      auto_published: reviewerId === null,
    })
    .select("id, slug")
    .single();
  if (error || !article) return { ok: false as const, error: "Couldn't publish — slug may already exist." };

  await admin.from("article_drafts").update({ status: "published", reviewer_id: reviewerId }).eq("id", d.id);

  const url = `${SITE.url}/blog/${article.slug}`;
  // Run from a laptop, SITE.url is localhost: never announce a link nobody else can open
  if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(SITE.url)) {
    console.warn(`[publish] site URL is ${SITE.url}; skipped the Telegram channel post and IndexNow ping`);
    return { ok: true as const, id: article.id as string, slug: article.slug as string, url };
  }
  if (process.env.TELEGRAM_CHANNEL_ID && (await getFlag("telegram_sends", admin))) {
    const ok = await sendTelegram(process.env.TELEGRAM_CHANNEL_ID, `<b>${esc(d.title)}</b>\n\n${esc(d.summary ?? "")}`, [[{ text: "Read on GeeksFinder", url }]]);
    if (ok) await admin.from("articles").update({ telegram_posted: true }).eq("id", article.id);
  }
  if (process.env.INDEXNOW_KEY) {
    // Bing/Yandex fast indexing
    // Key file at the site root (next.config rewrite), so it covers every page; IndexNow finds it at /<key>.txt
    await fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${process.env.INDEXNOW_KEY}`, { signal: AbortSignal.timeout(10_000) }).catch(() => {});
  }
  return { ok: true as const, id: article.id as string, slug: article.slug as string, url };
}
