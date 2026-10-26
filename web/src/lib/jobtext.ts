/**
 * Turn a stored job description into readable blocks (headings, paragraphs, bullet lists).
 * New jobs keep their line breaks from the source; older ones were flattened to one line,
 * so for those we break before common section headings and group sentences into short paragraphs.
 */
import { decodeEntities, stripTags } from "./html-text";

/**
 * HTML job post → plain text that keeps paragraph, heading and list structure as line breaks.
 * `encoded`: the feed sends HTML that is itself entity-encoded (Greenhouse), so it's decoded once into HTML first.
 * Tags and entities are handled by lib/html-text.ts (tags removed until none are left; entities decoded once).
 */
export function htmlToText(html: string, { encoded = false } = {}) {
  const structured = (encoded ? decodeEntities(html) : html)
    .replace(/<\s*li\b[^>]*>/gi, "\n• ")
    .replace(/<\s*(br|\/p|\/div|\/h[1-6]|h[1-6]|\/li|\/ul|\/ol|\/tr)\b[^>]*>/gi, "\n");
  return stripTags(decodeEntities(stripTags(structured)))
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const YEARS_RE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)(?:\s+of)?(?:\s+[\w-]+){0,4}?\s+experience/gi;
const MIN_YEARS_RE = /(?:minimum|at least|min\.?)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)/gi;

/** Smallest "N years of experience" the post asks for, or null if it never says. AI tagging can miss this; this can't. */
export function minYearsAsked(text: string | null | undefined): number | null {
  const t = text ?? "";
  const nums = [...t.matchAll(YEARS_RE), ...t.matchAll(MIN_YEARS_RE)].map((m) => Number(m[1])).filter((n) => n < 30);
  return nums.length ? Math.min(...nums) : null;
}

export type JobBlock = { kind: "heading"; text: string } | { kind: "para"; text: string } | { kind: "list"; items: string[] };

const HEADINGS = [
  "About (?:the |this )?(?:role|job|team|position|opportunity|company|us)",
  "About [A-Z][\\w&.'’-]+(?: [A-Z][\\w&.'’-]+)?",
  "(?:Key |Your |Main |Primary )?Responsibilities",
  "What you(?:'|’)ll (?:do|bring|need|work on|learn)",
  "What you will (?:do|bring|need|work on|learn)",
  "What (?:we(?:'|’)re|we are) looking for",
  "What we offer",
  "Who you are",
  "(?:Minimum |Basic |Preferred |Required |Bonus )?(?:Qualifications|Requirements)",
  "(?:Required |Preferred |Key )?Skills(?: required)?",
  "Nice to have",
  "Good to have",
  "(?:Our )?Benefits",
  "Perks(?: and benefits)?",
  "Why (?:join us|you(?:'|’)ll love working here|work with us)",
  "The role",
  "Your role",
  "Role overview",
  "Job (?:description|summary)",
  "Eligibility(?: criteria)?",
  "Location",
];
const HEADING_RE = new RegExp(`(?:^|\\s)(${HEADINGS.join("|")})\\s*[:\\-–]?\\s+(?=[A-Z•])`, "g");
const BULLET = /^\s*(?:[•●▪◦*·-]|\d{1,2}[.)])\s+/;

function sentences(text: string) {
  return text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

function paragraphs(text: string, out: JobBlock[]) {
  const s = sentences(text);
  for (let i = 0; i < s.length; i += 3) out.push({ kind: "para", text: s.slice(i, i + 3).join(" ") });
}

export function formatJobDescription(raw: string | null | undefined): JobBlock[] {
  const text = (raw ?? "").replace(/\r/g, "").trim();
  if (!text) return [];
  const out: JobBlock[] = [];

  if (text.includes("\n")) {
    let list: string[] = [];
    const flush = () => { if (list.length) out.push({ kind: "list", items: list }); list = []; };
    for (const line of text.split("\n").map((l) => l.trim())) {
      if (!line) continue; // blank lines between <li> items shouldn't split one list into many
      if (BULLET.test(line)) { list.push(line.replace(BULLET, "")); continue; }
      flush();
      // A short line without ending punctuation reads as a section heading
      if (line.length <= 60 && !/[.,;!?]$/.test(line) && line.split(" ").length <= 8) out.push({ kind: "heading", text: line.replace(/:$/, "") });
      else paragraphs(line, out);
    }
    flush();
    return out;
  }

  // Flat text: split on known headings, then on inline bullets
  const parts = text.replace(HEADING_RE, (_, h: string) => `\n§${h}\n`).split("\n").map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    if (p.startsWith("§")) { out.push({ kind: "heading", text: p.slice(1) }); continue; }
    const bits = p.split(/\s+[•●▪]\s+/).map((b) => b.trim()).filter(Boolean);
    if (bits.length > 2) {
      if (!/^[•●▪]/.test(p)) paragraphs(bits.shift()!, out);
      out.push({ kind: "list", items: bits.map((b) => b.replace(/^[•●▪]\s*/, "")) });
    } else paragraphs(p.replace(/^[•●▪]\s*/, ""), out);
  }
  return out;
}
