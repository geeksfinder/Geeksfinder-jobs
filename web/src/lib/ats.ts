/** Plain-code ATS check (no AI): runs in the browser, so the resume never leaves the device. */

import { SKILL_LIST, skillSpellings } from "./skills";

// Every branch's skills from the shared dictionary (lib/skills.ts), not a software-only list
export const SKILLS = SKILL_LIST.map((s) => s.name);

const norm = (s: string) => s.toLowerCase();
const has = (text: string, skill: string) => {
  const s = norm(skill).replace(/[.+#/]/g, (c) => `\\${c}`);
  return new RegExp(`(^|[^a-z0-9])${s}([^a-z0-9]|$)`, "i").test(text);
};

export type AtsResult = {
  score: number;
  matched: string[];
  missing: string[];
  checks: { label: string; ok: boolean; tip: string }[];
};

export function checkAts(resume: string, job: string): AtsResult {
  const r = norm(resume);
  const j = norm(job);
  // A skill counts when any of its safe spellings appears ("ReactJS" on the resume covers "React" in the job)
  const found = (text: string, skill: string) => skillSpellings(skill, { inText: true }).some((sp) => has(text, sp));
  const asked = SKILLS.filter((s) => found(j, s));
  const matched = asked.filter((s) => found(r, s));
  const missing = asked.filter((s) => !found(r, s));
  const words = resume.split(/\s+/).filter(Boolean).length;

  const checks = [
    { label: "Email and phone are present", ok: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(resume) && /(\+?91[\s-]?)?[6-9]\d{9}|\d{5}[\s-]\d{5}/.test(resume), tip: "Put your email and phone at the top in plain text." },
    { label: "Has a Skills section", ok: /\bskills\b/i.test(resume), tip: "Add a heading called Skills — ATS software looks for it." },
    { label: "Has Projects or Experience", ok: /\b(projects?|experience|internship)\b/i.test(resume), tip: "Add a Projects section with 2–3 things you built." },
    { label: "Has Education", ok: /\b(education|b\.?tech|b\.?e\.?|bca|mca|b\.?sc|degree|university|college)\b/i.test(resume), tip: "Add your degree, college and graduation year." },
    { label: "Length fits one page (250–700 words)", ok: words >= 250 && words <= 700, tip: words < 250 ? "Your resume looks short. Add detail to projects." : "Trim to one page for fresher roles." },
    { label: "Uses numbers to show impact", ok: /\d+\s*(%|users|students|ms|x\b|lakh|k\b)/i.test(resume), tip: "Where true, add numbers: users, speed-up, accuracy, team size." },
    { label: "Covers most skills the job asks for", ok: asked.length === 0 || matched.length / asked.length >= 0.6, tip: "Add the asked skills you genuinely have to your Skills section." },
  ];

  const skillScore = asked.length ? (matched.length / asked.length) * 60 : 40;
  const checkScore = (checks.filter((c) => c.ok).length / checks.length) * 40;
  return { score: Math.round(skillScore + checkScore), matched, missing, checks };
}
