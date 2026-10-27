import { decodeEntities } from "./html-text";

/**
 * Govt & PSU openings, read only from each organisation's own careers page (never from repost sites). The 6:00 run
 * (scripts/cron.ts govtJobs) lists a page's links with the text around them, asks AI which are current openings
 * (lib/ai.ts govtListPrompt), reads each new notice once (govtNoticePrompt) and saves it as a job with its last date.
 * These helpers are the plain-code part: no network, no AI.
 */
export type GovtSource = { id: string; name: string; url: string; domain: string; company_domain: string };
export type PageLink = { url: string; text: string; context: string };

/** A link on the organisation's own domain (bel-india.in or a subdomain), so a notice can't point anywhere else. */
export function onDomain(url: string, domain: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}

const clean = (s: string) => decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Every link on a page with its own text and the two pieces of text before it. Notices are often a heading
 * followed by "Click here to view the detailed advertisement", so the heading has to travel with the link.
 */
export function pageLinks(html: string, baseUrl: string, max = 400): PageLink[] {
  const body = html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, " ");
  const out: PageLink[] = [];
  const seen = new Set<string>();
  const recent: string[] = [];
  for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>|>([^<]+)(?=<)/gi)) {
    if (m[3] !== undefined) {
      const t = clean(m[3]);
      if (t.length >= 8) {
        recent.push(t.slice(0, 200));
        if (recent.length > 2) recent.shift();
      }
      continue;
    }
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m[1] ?? "")?.[1];
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href.trim())) continue;
    let url: string;
    try {
      url = new URL(decodeEntities(href.trim()), baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({ url, text: clean(m[2] ?? "").slice(0, 200), context: recent.join(" · ") });
    if (out.length >= max) break;
  }
  return out;
}

const ADVERT = /advertisement|advt|notification|notice|recruitment/i;
const NOT_ADVERT = /hindi|faq|form|certificate|scribe|result|handout|medical|paper|syllabus|policy|list of|admit|answer|corrigendum|objection|facilitation|centre|center/i;

/**
 * On an HTML notice page, the advertisement PDF it links to (Coal India keeps the details there, on its CDN).
 * The English copy: link text in Latin script, saying advertisement or notification, not a form or FAQ.
 */
export function advertLink(links: PageLink[]): PageLink | null {
  return (
    links.find((l) => /\.pdf(\?|#|$)/i.test(l.url) && ADVERT.test(l.text + " " + l.url) && !NOT_ADVERT.test(l.text) && !/[^\x00-\x7F]/.test(l.text)) ?? null
  );
}

/** "2026-11-12" if it's a real date, else null. */
export function isoDate(s: unknown): string | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Today's date in India, as "2026-10-28". */
export const todayIst = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);

export type GovtNotice = {
  is_opening: boolean;
  /** A fresh graduate or diploma holder with no work experience can apply to at least one post. */
  fresher_ok: boolean;
  title: string;
  posts: { name: string; vacancies?: number | null; qualification: string; branches: string[] }[];
  last_date: string | null;
  location: string;
  age_limit: string;
  how_to_apply: string;
  summary: string;
};

/** The job page text for a notice: what the post is, who can apply, the last date, and where the official notice is. */
export function govtDescription(n: GovtNotice, source: GovtSource, noticeUrl: string, lastDate: string) {
  const posts = n.posts
    .slice(0, 12)
    .map((p) => `• ${p.name}${p.vacancies ? ` (${p.vacancies} posts)` : ""}: ${p.qualification}${p.branches.length ? `. Branches: ${p.branches.join(", ")}` : ""}`)
    .join("\n");
  return [
    n.summary,
    `Posts\n${posts}`,
    n.age_limit ? `Age limit\n${n.age_limit}` : "",
    `Last date to apply\n${lastDate}`,
    n.how_to_apply ? `How to apply\n${n.how_to_apply}` : "",
    `Official notice\nRead the full notice on ${source.name}'s own website before applying: ${noticeUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
