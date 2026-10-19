/**
 * Re-check drafts waiting in the review queue with all three reviewers and publish the ones that pass.
 *   npx tsx --env-file=.env.local scripts/review-drafts.ts      (runs after every blog run in daily.yml)
 * A draft is reviewed by the AI editor only if it has never been reviewed or an admin edited it since
 * (editing clears the review). Unchanged drafts keep their stored scores, so a weak draft can't pass on a lucky
 * second roll. Drafts that fail — including ones that read as machine-written — stay in the queue with the reasons.
 */
import { withCronRun, type CronContext } from "@/lib/admin/cron-run";
import { getFlag } from "@/lib/admin/flags";
import { runChecks } from "@/lib/article-checks";
import { aiReview, canAutoPublish, seoReview, type AiReview, type SeoResult } from "@/lib/article-review";
import type { ArticleDraft } from "@/lib/articles";
import { publishDraft } from "@/lib/publish";
import { adminClient } from "@/lib/supabase/admin";

const db = adminClient();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const MAX = Number(process.env.REVIEW_MAX ?? 15);

type Stored = { seo_score?: number; seo_notes?: string[]; ai?: AiReview | null; held_because?: string[] };
type Facts = { facts: { fact: string; source_url: string }[]; related_skills?: string[]; freshers_note?: string; used_source_urls?: string[] };

async function main(ctx: CronContext) {
  if (!(await getFlag("article_pipeline", db))) return ctx.warn("article_pipeline is off: nothing reviewed or published");
  const { data: drafts } = await db
    .from("article_drafts")
    .select("id, kind, cluster_id, title, summary, topic, body_md, facts, review, created_at")
    .eq("status", "draft")
    .order("created_at")
    .limit(MAX);
  if (!drafts?.length) {
    log("review: no drafts waiting");
    return { published: 0, held: 0 };
  }

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: pub } = await db.from("articles").select("title").gte("published_at", since);
  const published = (pub ?? []).map((a) => a.title as string);

  let posted = 0;
  let held = 0;
  for (const d of drafts) {
    const facts = d.facts as Facts;
    const draft: ArticleDraft = {
      title: d.title ?? "",
      summary: d.summary ?? "",
      topic: d.topic as ArticleDraft["topic"],
      body_md: d.body_md ?? "",
      freshers_note: facts.freshers_note ?? "",
      related_skills: facts.related_skills ?? [],
      used_source_urls: facts.used_source_urls ?? [],
    };
    const factList = facts.facts.map((f) => f.fact);
    const kind = d.kind === "guide" ? "guide" : "news";
    const { data: items } = d.cluster_id ? await db.from("news_items").select("title, text").eq("cluster_id", d.cluster_id) : { data: [] };
    const sources = (items ?? []).map((i) => `${i.title}\n${i.text}`);

    const checks = runChecks(draft.body_md, draft.freshers_note, factList, sources);
    // Compare against published articles and other waiting drafts, not against itself
    const others = [...published, ...drafts.filter((x) => x.id !== d.id).map((x) => x.title as string)];
    const seo: SeoResult = seoReview(draft, others);
    const stored = d.review as Stored | null;
    const review = stored?.ai !== undefined ? stored.ai : await aiReview(draft, factList, kind);
    const gate = canAutoPublish(checks, seo, review);

    await db.from("article_drafts").update({
      overlap_score: checks.overlap,
      factcheck_passed: checks.factcheck_passed,
      check_notes: checks.notes,
      review: { seo_score: seo.score, seo_notes: seo.notes, ai: review, held_because: gate.reasons },
    }).eq("id", d.id);

    if (!gate.publish) {
      held++;
      log(`review: kept "${d.title}" in drafts — ${gate.reasons.slice(0, 3).join(" | ")}`);
      continue;
    }
    const res = await publishDraft(db, d, "GeeksFinder's automated checks", null);
    if (!res.ok) { held++; log(`review: "${d.title}" passed but couldn't publish: ${res.error}`); continue; }
    await db.from("article_drafts").update({ auto_published: true }).eq("id", d.id);
    published.push(d.title as string);
    posted++;
    log(`review: published "${d.title}" → ${res.url}`);
  }
  log(`review: ${posted} published, ${held} kept in drafts`);
  return { published: posted, held };
}

withCronRun("review-drafts", main, db).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
