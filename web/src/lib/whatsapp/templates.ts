/**
 * WhatsApp templates (SPEC.md §3 Templates). Meta rejects variables with newlines or tabs, so each job is its own
 * variable and every variable is plain text cut to 60 characters. Button suffixes are ids only; the pages behind
 * them require login.
 */
export const TEMPLATES = {
  verify: "gf_verify", // authentication: standard 6-digit code, "Copy code" button
  daily3: "gf_daily_3", // utility (submitted): 3 job lines, for 3 or more new matches
  daily1: "gf_daily_1", // utility (submitted): 1 job line, for 1 or 2 new matches
} as const;
export type TemplateName = (typeof TEMPLATES)[keyof typeof TEMPLATES];

/** Category each template was submitted as; used for the cost estimate until Meta reports the billed one. */
export const SUBMITTED_CATEGORY: Record<TemplateName, "authentication" | "utility"> = {
  gf_verify: "authentication",
  gf_daily_3: "utility",
  gf_daily_1: "utility",
};

export const CONSENT_VERSION = "wa-consent-v1";
export const CONSENT_COPY = "Send my daily job matches to this WhatsApp number. One message each morning, only when there are new matches. Reply STOP anytime.";

/** Fixed replies: the only non-template text this number ever sends (no free-form chat, SPEC.md §1). */
export const FIXED_REPLIES = {
  stop_confirm: "You won't get GeeksFinder job alerts on WhatsApp any more. Reply START to turn them back on.",
  start_confirm: "WhatsApp job alerts are back on. Reply STOP anytime to turn them off.",
  auto_reply: "This number only sends GeeksFinder job alerts. For help, open GeeksFinder and tap Help.",
} as const;
export type FixedReply = keyof typeof FIXED_REPLIES;

const MAX = 60;
// Control characters plus the Unicode line and paragraph separators (U+2028, U+2029), which also break a line
const CONTROL = new RegExp(`[\u0000-\u001f\u007f${String.fromCharCode(0x2028, 0x2029)}]+`, "g");

/** Plain, single-line text of at most 60 characters: no newlines, tabs, control characters or WhatsApp formatting. */
export function cleanParam(input: string, max = MAX): string {
  const flat = input
    .replace(CONTROL, " ")
    .replace(/[*_~`]/g, "") // bold, italic, strike, monospace markers
    .replace(/\{\{|\}\}/g, "")
    .replace(/ {2,}/g, " ") // Meta rejects runs of spaces
    .trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

export type DigestJob = { id: string; title: string; company: string; city: string | null; score: number };

/** "Frontend Developer Intern · Zepto · Bengaluru · 87%" */
export function jobLine(j: DigestJob): string {
  return cleanParam([j.title, j.company, j.city || "Remote", `${Math.round(j.score)}%`].map((p) => cleanParam(p)).join(" · "));
}

/** gf_daily_3 for 3 or more new matches, gf_daily_1 for 1 or 2, nothing for none. */
export function chooseTemplate(newMatches: number): TemplateName | null {
  if (newMatches <= 0) return null;
  return newMatches >= 3 ? TEMPLATES.daily3 : TEMPLATES.daily1;
}

export type TemplateMessage = { template: TemplateName; body: string[]; buttons: string[] };

/** Parameters for the morning digest, from the top matches by score. Null when there is nothing new. */
export function digestMessage(firstName: string | null, digestId: string, matches: DigestJob[]): TemplateMessage | null {
  const template = chooseTemplate(matches.length);
  if (!template) return null;
  const top = [...matches].sort((a, b) => b.score - a.score);
  const lines = top.slice(0, template === TEMPLATES.daily3 ? 3 : 1).map(jobLine);
  return {
    template,
    body: [cleanParam(firstName?.split(/\s+/)[0] || "there", 30), String(matches.length), ...lines],
    // "See matches" → /m/<digest id>, "Tailor top match" → /j/<top job id>
    buttons: [cleanParam(digestId), cleanParam(top[0].id)],
  };
}

export function verifyMessage(code: string): TemplateMessage {
  return { template: TEMPLATES.verify, body: [code], buttons: [code] };
}
