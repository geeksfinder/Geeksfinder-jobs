/**
 * GeeksFinder Blog pipeline (plan §6). Runs every 6 h on GitHub Actions:  npx tsx scripts/news.ts
 * 1 fetch RSS/news API → 2 dedupe + cluster (2+ sources, relevant) → 3 extract facts per source
 * → 4 Claude writes from facts only → 5 automated checks → 6 drafts land in the admin review queue.
 * Nothing auto-publishes.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { AiBudgetError, generateJSON, untrusted } from "@/lib/ai";
import { runChecks } from "@/lib/article-checks";
import { GUIDES_PER_DAY, NEWS_PER_DAY, writeArticle, type ArticleDraft, type ArticleKind, type Fact } from "@/lib/articles";
import { safeFetch } from "@/lib/safe-fetch";
import { adminClient } from "@/lib/supabase/admin";

const db = adminClient();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

type Item = { source_id: string; url: string; title: string; published_at: string | null; text: string; publisher: string | null };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const stripTags = (s: string) => decode(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
/** Feeds wrap dates in CDATA or use odd formats; an unreadable date must not drop the whole feed. */
const rssDate = (raw: string) => {
  const t = Date.parse(decode(raw).trim());
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/**
 * Main article text: prefer <article>, else all <p> tags; some sites (Economic Times) keep the text only in the
 * schema.org articleBody they publish for search engines, so take whichever is longer. Untrusted data downstream.
 */
function articleText(html: string) {
  const art = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const paras = [...art.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1])).filter((p) => p.length > 40).join("\n");
  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => {
      try {
        const j = JSON.parse(m[1]);
        const nodes = Array.isArray(j) ? j : (j["@graph"] ?? [j]);
        return nodes.map((n: { articleBody?: unknown }) => (typeof n?.articleBody === "string" ? n.articleBody : "")).join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
  const body = stripTags(ld);
  return (body.length > paras.length ? body : paras).slice(0, 12000);
}

async function fetchRss(src: { id: string; url: string }): Promise<Item[]> {
  const res = await safeFetch(src.url, { maxBytes: 2_000_000 });
  const items = [...res.text.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25);
  return items.map(([, xml]) => {
    const url = decode(tag(xml, "link")).trim();
    // Google News items name the real outlet in <source url="https://www.thehindu.com">; direct feeds are the outlet
    const sourceUrl = xml.match(/<source[^>]*url="([^"]+)"/i)?.[1];
    return {
      source_id: src.id,
      url,
      title: stripTags(tag(xml, "title")),
      published_at: rssDate(tag(xml, "pubDate")),
      text: stripTags(tag(xml, "description")),
      publisher: host(sourceUrl ?? url) || null,
    };
  });
}

async function fetchGNews(): Promise<Omit<Item, "source_id">[]> {
  if (!process.env.GNEWS_API_KEY) return [];
  const q = encodeURIComponent('("fresher hiring" OR "campus hiring" OR "off campus" OR internship) India');
  const res = await fetch(`https://gnews.io/api/v4/search?q=${q}&lang=en&country=in&max=25&apikey=${process.env.GNEWS_API_KEY}`, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  return (data.articles ?? []).map((a: { url: string; title: string; publishedAt: string; content?: string; description?: string }) => ({
    url: a.url, title: a.title, published_at: a.publishedAt, text: `${a.description ?? ""}\n${a.content ?? ""}`, publisher: host(a.url) || null,
  }));
}

async function fetchAll() {
  const { data: sources } = await db.from("news_sources").select("id, url, type").eq("active", true);
  const items: Item[] = [];
  for (const s of sources ?? []) {
    if (s.type !== "rss") continue;
    try { items.push(...(await fetchRss(s))); } catch (e) { log("rss failed", s.url, (e as Error).message); }
  }
  const gnews = await fetchGNews().catch(() => []);
  if (gnews.length) {
    const { data: src } = await db.from("news_sources").upsert({ name: "GNews API", type: "api", url: "https://gnews.io/api/v4/search" }, { onConflict: "url" }).select("id").single();
    items.push(...gnews.map((g) => ({ ...g, source_id: src!.id })));
  }

  // Skip known URLs; fetch fuller text for new ones (SSRF-guarded)
  const urls = [...new Set(items.map((i) => i.url).filter((u) => /^https?:/.test(u)))];
  const { data: known } = await db.from("news_items").select("url, publisher").in("url", urls.slice(0, 500));
  // Items saved before publishers were recorded: fill in the outlet so they can count as separate sources
  for (const k of known ?? []) {
    if (k.publisher) continue;
    const it = items.find((i) => i.url === k.url && i.publisher);
    if (it) await db.from("news_items").update({ publisher: it.publisher }).eq("url", k.url).is("publisher", null);
  }
  const seen = new Set((known ?? []).map((k) => k.url));
  let added = 0;
  for (const it of items) {
    if (!it.url || seen.has(it.url)) continue;
    seen.add(it.url);
    try {
      const page = await safeFetch(it.url, { timeoutMs: 8000, maxBytes: 1_500_000 });
      if (page.status < 400 && /html/.test(page.contentType)) {
        const body = articleText(page.text);
        if (body.length > it.text.length) it.text = body;
        it.url = page.url; // resolved after redirects
      }
    } catch { /* keep RSS snippet */ }
    const text_hash = createHash("sha256").update(it.text.slice(0, 2000)).digest("hex");
    const { error } = await db.from("news_items").insert({ ...it, text_hash });
    if (!error) added++;
  }
  log(`news: ${added} new items`);
}

type Cluster = { headline: string; item_ids: string[]; relevance: number };

async function cluster(): Promise<{ id: string; headline: string }[]> {
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data: items } = await db.from("news_items").select("id, url, title, text, publisher").is("cluster_id", null).gte("created_at", since).limit(120);
  if (!items?.length) return [];
  const outlet = (i: { url: string; publisher: string | null }) => i.publisher || host(i.url);
  const list = items.map((i) => `${i.id} | ${outlet(i)} | ${i.title} | ${i.text.slice(0, 200)}`).join("\n");
  const res = await generateJSON<{ clusters: Cluster[] }>(`Group these news items into clusters that report the SAME event (same company + same announcement).
Score each cluster's relevance 0–10 for Indian final-year students and freshers looking for jobs (hiring drives, fresher salaries, layoffs, in-demand skills, internships, exams/certifications, interview-process changes). Drop unrelated items.
Return JSON {"clusters":[{"headline":string,"item_ids":string[],"relevance":number}]}.

${untrusted("news_list", list, 30000)}`);

  const byId = new Map(items.map((i) => [i.id, i]));
  const kept: { id: string; headline: string }[] = [];
  for (const c of (res.clusters ?? []).sort((a, b) => b.relevance - a.relevance)) {
    const ids = c.item_ids.filter((id) => byId.has(id));
    const domains = new Set(ids.map((id) => outlet(byId.get(id)!)));
    if (c.relevance < 7 || domains.size < 2) continue; // need 2+ independent sources
    const cid = randomUUID();
    await db.from("news_items").update({ cluster_id: cid }).in("id", ids);
    kept.push({ id: cid, headline: c.headline.slice(0, 200) });
  }
  log(`news: ${kept.length} clusters with 2+ sources`);
  return kept;
}

async function extractFacts(clusterId: string): Promise<{ facts: Fact[]; sources: string[]; outlets: number }> {
  const { data: items } = await db.from("news_items").select("url, title, text, publisher").eq("cluster_id", clusterId);
  const outletOf = new Map((items ?? []).map((i) => [i.url, i.publisher || host(i.url)]));
  const facts: Fact[] = [];
  for (const it of items ?? []) {
    try {
      const r = await generateJSON<{ facts: string[] }>(`List the verifiable facts in this news article as short standalone sentences: who, what, where, when, numbers (CTC, openings, dates), and any direct quotes with the speaker named. No opinions. Return JSON {"facts": string[]} with at most 15 facts.

${untrusted("article", `${it.title}\n${it.text}`, 10000)}`);
      for (const f of r.facts ?? []) if (typeof f === "string" && f.length > 10) facts.push({ fact: f.slice(0, 400), source_url: it.url });
    } catch (e) { log("facts failed", it.url, (e as Error).message); }
  }
  // Count outlets by publisher, not link host: Google News links are all news.google.com
  const outlets = new Set(facts.map((f) => outletOf.get(f.source_url) ?? host(f.source_url))).size;
  return { facts, sources: (items ?? []).map((i) => `${i.title}\n${i.text}`), outlets };
}

/** Stories grouped in the last 48 h that never got a draft. The first item's title stands in for the headline. */
async function unwrittenClusters(): Promise<{ id: string; headline: string }[]> {
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const { data: items } = await db.from("news_items").select("cluster_id, title").not("cluster_id", "is", null).gte("created_at", since).limit(500);
  const ids = [...new Set((items ?? []).map((i) => i.cluster_id as string))];
  if (!ids.length) return [];
  const { data: done } = await db.from("article_drafts").select("cluster_id").in("cluster_id", ids);
  const drafted = new Set((done ?? []).map((d) => d.cluster_id));
  return ids.filter((id) => !drafted.has(id)).map((id) => ({ id, headline: (items ?? []).find((i) => i.cluster_id === id)!.title.slice(0, 200) }));
}

/** One tiny request on the cheapest models; listing models isn't enough, since blocked projects can still list them. */
async function geminiKeyWorks(key: string) {
  const models = (process.env.GEMINI_MODELS ?? "gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((m) => m.trim()).reverse();
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply OK" }] }], generationConfig: { maxOutputTokens: 5 } }),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (res?.ok) return true;
  }
  return false;
}

async function main() {
  // Optional separate Gemini key just for the blog, so its free quota doesn't compete with job enrichment and
  // resume tailoring. This script runs in its own process, so swapping the variable here affects only the blog.
  // A blocked or mistyped blog key must not stop the blog, so it is tested first and the main key is kept if it fails.
  if (process.env.GEMINI_BLOG_API_KEY) {
    if (await geminiKeyWorks(process.env.GEMINI_BLOG_API_KEY)) process.env.GEMINI_API_KEY = process.env.GEMINI_BLOG_API_KEY;
    else log("news: GEMINI_BLOG_API_KEY doesn't work (blocked, wrong or out of quota); using GEMINI_API_KEY for the blog");
  }
  await fetchAll();
  // New stories first, then recent stories whose article failed to write (AI busy, no credit…) for another try
  const clusters = [...(await cluster()), ...(await unwrittenClusters())];
  let newsLeft = NEWS_PER_DAY - (await draftsToday("news"));

  try {
    for (const c of clusters) {
      if (newsLeft <= 0) break;
      const { facts, sources, outlets } = await extractFacts(c.id);
      if (facts.length < 4 || outlets < 2) continue;
      const done = await draftWithRewrite({ headline: c.headline, facts }, sources, "news");
      if (!done) continue;
      await saveDraft(done, facts, { kind: "news", cluster_id: c.id });
      newsLeft--;
    }
    await writeGuides();
  } catch (e) {
    if (!(e instanceof AiBudgetError)) throw e;
    log("news: daily AI cap reached; the rest wait for the next run");
  }
}

type Done = { draft: ArticleDraft; checks: ReturnType<typeof runChecks> };

async function draftsToday(kind: ArticleKind) {
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const { count } = await db.from("article_drafts").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", `${today}T00:00:00+05:30`);
  return count ?? 0;
}

/** Write, check, and give the writer one rewrite with the checker's notes; keep whichever version has fewer problems. */
async function draftWithRewrite(cluster: { headline: string; facts: Fact[] }, sources: string[], kind: ArticleKind): Promise<Done | null> {
  const factList = cluster.facts.map((f) => f.fact);
  let draft = await writeArticle(cluster, [], kind);
  if (!draft) return null;
  let checks = runChecks(draft.body_md, draft.freshers_note, factList, sources);
  if (!checks.passed) {
    const retry = await writeArticle(cluster, checks.notes, kind);
    const retryChecks = retry ? runChecks(retry.body_md, retry.freshers_note, factList, sources) : null;
    if (retry && retryChecks && retryChecks.notes.length < checks.notes.length) {
      draft = retry;
      checks = retryChecks;
    }
  }
  return { draft, checks };
}

async function saveDraft({ draft, checks }: Done, facts: Fact[], where: { kind: ArticleKind; cluster_id?: string; guide_key?: string }) {
  const { error } = await db.from("article_drafts").insert({
    ...where,
    topic: draft.topic,
    title: draft.title,
    summary: draft.summary,
    facts: { facts, related_skills: draft.related_skills, freshers_note: draft.freshers_note, used_source_urls: draft.used_source_urls },
    body_md: draft.body_md,
    overlap_score: checks.overlap,
    factcheck_passed: checks.factcheck_passed,
    check_notes: checks.notes,
    status: "draft",
  });
  if (error) return log(`${where.kind}: couldn't save "${draft.title}": ${error.message}`);
  log(`${where.kind}: drafted "${draft.title}" (${checks.passed ? "checks passed" : `${checks.notes.length} issues`})`);
}

type Guide = { key: string; topic: string; title: string; angle: string; skills: string[] };

/** Evergreen guides from scripts/guides.json, in order, each topic once. */
async function writeGuides() {
  let left = GUIDES_PER_DAY - (await draftsToday("guide"));
  if (left <= 0) return;
  const { guides } = JSON.parse(readFileSync(new URL("./guides.json", import.meta.url), "utf8")) as { guides: Guide[] };
  const { data: used } = await db.from("article_drafts").select("guide_key").not("guide_key", "is", null);
  const taken = new Set((used ?? []).map((u) => u.guide_key));
  const todo = guides.filter((g) => !taken.has(g.key));
  if (!todo.length) return log("guides: every topic in guides.json has been drafted; add new ones at the end");

  for (const g of todo) {
    if (left <= 0) break;
    const facts = await siteFacts(g.skills);
    const headline = `${g.title}. Angle: ${g.angle} Topic label to use: ${g.topic}.`;
    // No news sources to compare against, so the copy check is skipped; numbers and names still must be in the facts
    const done = await draftWithRewrite({ headline, facts }, [], "guide");
    if (!done) continue;
    await saveDraft(done, facts, { kind: "guide", guide_key: g.key });
    left--;
  }
}

/** Live numbers from GeeksFinder's own job listings (last 30 days) that guides may cite. */
async function siteFacts(skills: string[]): Promise<Fact[]> {
  const url = `${(process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/jobs`;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: jobs } = await db.from("jobs").select("title, location, remote, skills, fresher_friendly").eq("enriched", true).gte("created_at", since).limit(5000);
  const all = jobs ?? [];
  const fresher = all.filter((j) => j.fresher_friendly);
  const pool = fresher.length >= 20 ? fresher : all;
  const label = pool === fresher ? "fresher-friendly jobs" : "jobs";
  const count = (rows: typeof all, test: (j: (typeof all)[number]) => boolean) => rows.filter(test).length;
  const tally = (items: string[]) => [...items.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  const facts: string[] = [
    `GeeksFinder listed ${all.length} live jobs in India in the last 30 days, of which ${fresher.length} were marked fresher-friendly.`,
    `${count(all, (j) => /intern/i.test(j.title))} of those jobs were internships and ${count(all, (j) => !!j.remote)} were remote.`,
  ];
  const topSkills = tally(pool.flatMap((j) => (j.skills ?? []) as string[])).slice(0, 8);
  if (topSkills.length) facts.push(`The skills most often asked for in ${label} on GeeksFinder this month: ${topSkills.map(([s, n]) => `${s} (${n} jobs)`).join(", ")}.`);
  const topCities = tally(pool.filter((j) => !j.remote).map((j) => String(j.location ?? "").split(",")[0].trim()).filter(Boolean)).slice(0, 6);
  if (topCities.length) facts.push(`Cities with the most ${label} on GeeksFinder this month: ${topCities.map(([c, n]) => `${c} (${n})`).join(", ")}.`);
  for (const s of skills) {
    const n = count(pool, (j) => ((j.skills ?? []) as string[]).some((k) => k.toLowerCase() === s.toLowerCase()));
    if (n) facts.push(`${n} of the ${pool.length} ${label} on GeeksFinder this month asked for ${s}.`);
  }
  return facts.map((fact) => ({ fact, source_url: url }));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
