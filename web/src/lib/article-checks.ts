/**
 * Automated checks before a draft reaches the human review queue (plan §6 step 5):
 * - Overlap: no run of 8+ consecutive words shared with any source.
 * - Fact check: every number and name in the draft must exist in the fact list.
 * - Banned phrases and length (600–1,000 words).
 */

export const BANNED = [
  "in today's fast-paced world", "delve", "game-changer", "game changer", "unlock", "landscape",
  "navigate the", "in conclusion", "dive into", "it's worth noting", "rest assured", "revolutionize", "tapestry",
];

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9₹%.\s]/g, " ").split(/\s+/).filter(Boolean);
const plain = (md: string) => md.replace(/[#*_>`[\]()]/g, " ");

/** Longest run of consecutive words in `draft` that also appears contiguously in any source. */
export function longestSharedRun(draft: string, sources: string[]): number {
  const d = words(plain(draft));
  const grams = new Set<string>();
  const N = 8;
  for (const src of sources) {
    const w = words(src);
    for (let i = 0; i + N <= w.length; i++) grams.add(w.slice(i, i + N).join(" "));
  }
  let best = 0;
  let run = 0;
  for (let i = 0; i + N <= d.length; i++) {
    if (grams.has(d.slice(i, i + N).join(" "))) {
      run = run ? run + 1 : N;
      best = Math.max(best, run);
    } else run = 0;
  }
  return best;
}

/** Numbers (with units) and capitalised names in the draft that don't appear in the facts. */
export function unsupportedClaims(draft: string, facts: string[]): string[] {
  const factText = facts.join(" ").toLowerCase().replace(/,/g, "");
  const issues = new Set<string>();
  const text = plain(draft);

  for (const n of text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    const v = n.replace(/,/g, "");
    if (v.length === 1 || /^20[2-3]\d$/.test(v)) continue; // single digits and recent years are fine
    if (!factText.includes(v)) issues.add(`number "${n}"`);
  }
  // Multi-word capitalised names (companies, people, programmes), not at sentence start. A word may contain dots
  // ("Node.js", "B.Tech") but not end with one, so "...in Roorkee. As" is not read as the name "Roorkee. As".
  const word = String.raw`[A-Z][a-zA-Z&]*(?:\.[A-Za-z]+)*`;
  const names = text.match(new RegExp(String.raw`(?<=[a-z,;:]\s)(${word}(?:\s${word})+)`, "g")) ?? [];
  for (const name of names) {
    const n = name.toLowerCase();
    // Accept a known name plus one trailing word ("Naukri JobSpeak Index Data" when the facts say "Naukri JobSpeak Index")
    const shorter = n.split(" ").slice(0, -1).join(" ");
    if (!factText.includes(n) && !(shorter.includes(" ") && factText.includes(shorter))) issues.add(`name "${name}"`);
  }
  return [...issues];
}

export function bannedPhrases(text: string) {
  const t = text.toLowerCase();
  return BANNED.filter((b) => t.includes(b));
}

export const wordCount = (md: string) => words(plain(md)).length;

export function runChecks(draftMd: string, freshersNote: string, facts: string[], sources: string[]) {
  const full = `${draftMd}\n\n${freshersNote}`;
  const overlap = longestSharedRun(full, sources);
  const unsupported = unsupportedClaims(draftMd, facts);
  const banned = bannedPhrases(full);
  const count = wordCount(full);
  const notes: string[] = [];
  if (overlap >= 8) notes.push(`Shares ${overlap} consecutive words with a source — rewrite that passage.`);
  if (unsupported.length) notes.push(`Not in fact list: ${unsupported.slice(0, 10).join(", ")}`);
  if (banned.length) notes.push(`Banned phrases: ${banned.join(", ")}`);
  if (count < 600 || count > 1000) notes.push(`Length ${count} words (target 600–1,000).`);
  if (/!/.test(full.replace(/!\[/g, ""))) notes.push("Contains an exclamation mark.");
  return {
    overlap,
    factcheck_passed: unsupported.length === 0,
    passed: overlap < 8 && unsupported.length === 0 && banned.length === 0 && count >= 600 && count <= 1000,
    notes,
  };
}
