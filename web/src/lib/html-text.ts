/**
 * HTML → plain text, shared by job descriptions (lib/jobtext.ts), job feeds (scripts/cron.ts) and news
 * (scripts/news.ts). The output is plain text: it's shown escaped by React or passed to AI as data, never
 * inserted as HTML. Article bodies that ARE shown as HTML go through sanitize-html in lib/markdown.ts.
 */

const NAMED: Record<string, string> = {
  lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " ",
  rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", bull: "•",
};

/**
 * Decode HTML entities in ONE pass, so each is decoded exactly once: "&amp;lt;" becomes "&lt;", never "<".
 * Handles named entities above and numeric ones (&#39; &#x27;). Unknown entities are left as they are.
 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}

/**
 * Remove <script>/<style> blocks and every tag, repeating until nothing changes, so nested tricks such as
 * "<scr<script>ipt>" can't leave a tag behind. Closing tags with spaces or attributes ("</script >") count too.
 * Any stray "<" or ">" left at the end is dropped, so the result can never contain a tag.
 */
export function stripTags(html: string, replacement = " "): string {
  let s = html;
  let prev: string;
  do {
    prev = s;
    s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\b[^>]*>/gi, " ").replace(/<[^<>]*>/g, replacement);
  } while (s !== prev);
  return s.replace(/[<>]/g, " ");
}

/** One-line plain text from HTML: tags removed, entities decoded once, spaces collapsed. */
export function plainText(html: string): string {
  return stripTags(decodeEntities(stripTags(html))).replace(/\s+/g, " ").trim();
}
