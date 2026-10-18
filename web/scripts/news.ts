/**
 * GeeksFinder Blog pipeline (plan §6). Runs every 6 h on GitHub Actions:  npx tsx scripts/news.ts
 * 1 fetch RSS/news API → 2 dedupe + cluster (2+ sources, relevant) → 3 extract facts per source
 * → 4 Claude writes from facts only → 5 automated checks → 6 drafts land in the admin review queue.
 * Nothing auto-publishes.
 */
import { createHash, randomUUID } from "node:crypto";
import { generateJSON, untrusted } from "@/lib/ai";
import { runChecks } from "@/lib/article-checks";
import { writeArticle, type Fact } from "@/lib/articles";
import { safeFetch } from "@/lib/safe-fetch";
import { adminClient } from "@/lib/supabase/admin";

const db = adminClient();
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
const MAX_DRAFTS = Number(process.env.ARTICLES_PER_DAY ?? 3);

type Item = { source_id: string; url: string; title: string; published_at: string | null; text: string };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const stripTags = (s: string) => decode(s).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Main article text: prefer <article>, else all <p> tags. Treated as untrusted data downstream. */
function articleText(html: string) {
  const art = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html;
  const paras = [...art.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => stripTags(m[1])).filter((p) => p.length > 40);
  return paras.join("\n").slice(0, 12000);
}

async function fetchRss(src: { id: string; url: string }): Promise<Item[]> {
  const res = await safeFetch(src.url, { maxBytes: 2_000_000 });
  const items = [...res.text.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 25);
  return items.map(([, xml]) => ({
    source_id: src.id,
    url: decode(tag(xml, "link")).trim(),
    title: stripTags(tag(xml, "title")),
    published_at: tag(xml, "pubDate") ? new Date(tag(xml, "pubDate")).toISOString() : null,
    text: stripTags(tag(xml, "description")),
  }));
}

async function fetchGNews(): Promise<Omit<Item, "source_id">[]> {
  if (!process.env.GNEWS_API_KEY) return [];
  const q = encodeURIComponent('("fresher hiring" OR "campus hiring" OR "off campus" OR internship) India');
  const res = await fetch(`https://gnews.io/api/v4/search?q=${q}&lang=en&country=in&max=25&apikey=${process.env.GNEWS_API_KEY}`, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  return (data.articles ?? []).map((a: { url: string; title: string; publishedAt: string; content?: string; description?: string }) => ({
    url: a.url, title: a.title, published_at: a.publishedAt, text: `${a.description ?? ""}\n${a.content ?? ""}`,
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
  const { data: known } = await db.from("news_items").select("url").in("url", urls.slice(0, 500));
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
  const { data: items } = await db.from("news_items").select("id, url, title, text").is("cluster_id", null).gte("created_at", since).limit(120);
  if (!items?.length) return [];
  const list = items.map((i) => `${i.id} | ${host(i.url)} | ${i.title} | ${i.text.slice(0, 200)}`).join("\n");
  const res = await generateJSON<{ clusters: Cluster[] }>(`Group these news items into clusters that report the SAME event (same company + same announcement).
Score each cluster's relevance 0–10 for Indian final-year students and freshers looking for jobs (hiring drives, fresher salaries, layoffs, in-demand skills, internships, exams/certifications, interview-process changes). Drop unrelated items.
Return JSON {"clusters":[{"headline":string,"item_ids":string[],"relevance":number}]}.

${untrusted("news_list", list, 30000)}`);

  const byId = new Map(items.map((i) => [i.id, i]));
  const kept: { id: string; headline: string }[] = [];
  for (const c of (res.clusters ?? []).sort((a, b) => b.relevance - a.relevance)) {
    const ids = c.item_ids.filter((id) => byId.has(id));
    const domains = new Set(ids.map((id) => host(byId.get(id)!.url)));
    if (c.relevance < 7 || domains.size < 2) continue; // need 2+ independent sources
    const cid = randomUUID();
    await db.from("news_items").update({ cluster_id: cid }).in("id", ids);
    kept.push({ id: cid, headline: c.headline.slice(0, 200) });
  }
  log(`news: ${kept.length} clusters with 2+ sources`);
  return kept;
}

async function extractFacts(clusterId: string): Promise<{ facts: Fact[]; sources: string[] }> {
  const { data: items } = await db.from("news_items").select("url, title, text").eq("cluster_id", clusterId);
  const facts: Fact[] = [];
  for (const it of items ?? []) {
    try {
      const r = await generateJSON<{ facts: string[] }>(`List the verifiable facts in this news article as short standalone sentences: who, what, where, when, numbers (CTC, openings, dates), and any direct quotes with the speaker named. No opinions. Return JSON {"facts": string[]} with at most 15 facts.

${untrusted("article", `${it.title}\n${it.text}`, 10000)}`);
      for (const f of r.facts ?? []) if (typeof f === "string" && f.length > 10) facts.push({ fact: f.slice(0, 400), source_url: it.url });
    } catch (e) { log("facts failed", it.url, (e as Error).message); }
  }
  return { facts, sources: (items ?? []).map((i) => `${i.title}\n${i.text}`) };
}

async function main() {
  await fetchAll();
  const clusters = await cluster();
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  const { count } = await db.from("article_drafts").select("id", { count: "exact", head: true }).gte("created_at", `${today}T00:00:00+05:30`);
  let budget = MAX_DRAFTS - (count ?? 0);

  for (const c of clusters) {
    if (budget <= 0) break;
    const { facts, sources } = await extractFacts(c.id);
    if (facts.length < 4 || new Set(facts.map((f) => host(f.source_url))).size < 2) continue;
    const draft = await writeArticle({ headline: c.headline, facts });
    if (!draft) continue;
    const checks = runChecks(draft.body_md, draft.freshers_note, facts.map((f) => f.fact), sources);
    await db.from("article_drafts").insert({
      cluster_id: c.id,
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
    budget--;
    log(`news: drafted "${draft.title}" (${checks.passed ? "checks passed" : `${checks.notes.length} issues`})`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
