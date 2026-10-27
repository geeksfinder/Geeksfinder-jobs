/**
 * Plain-code matching (no AI), per TRD:
 * score = 50×skill overlap + 20×role fit + 15×location fit + 10×fresher bonus + 5×recency
 * Matches ≥ 60 are stored. Skills compare through lib/skills.ts and places through lib/cities.ts.
 */
import { placeFit } from "./cities";
import { canonicalSkill, skillKey } from "./skills";

export const MATCH_THRESHOLD = 60;

export type MatchProfile = {
  skills: string[];
  preferred_roles: string[];
  locations: string[];
  job_type?: string | null;
};

export type MatchJob = {
  title: string;
  location: string | null;
  remote: boolean | null;
  skills: string[];
  fresher_friendly: boolean | null;
  posted_at: string | null;
};

// Skills compare through the shared dictionary, so "ReactJS" meets "React" and "AutoCAD 2D" meets "AutoCAD"
const key = (s: string) => skillKey(canonicalSkill(s));

export function scoreMatch(p: MatchProfile, j: MatchJob) {
  const mine = new Set(p.skills.map(key));
  const required = j.skills.map(key).filter(Boolean);
  const matched = j.skills.filter((s) => mine.has(key(s)));
  const skillOverlap = required.length ? matched.length / required.length : 0;

  const title = j.title.toLowerCase();
  const roleFit = p.preferred_roles.some((r) =>
    r.toLowerCase().split(/\s+/).filter((w) => w.length > 2).every((w) => title.includes(w)),
  )
    ? 1
    : p.preferred_roles.some((r) => r.toLowerCase().split(/\s+/).some((w) => w.length > 3 && title.includes(w)))
      ? 0.5
      : 0;

  // Spellings, typos and regions handled in lib/cities.ts ("Bangalore" = Bengaluru, Delhi NCR covers Noida)
  const locationFit = placeFit(p.locations, j.location, j.remote);

  const fresher = j.fresher_friendly ? 1 : 0;

  const ageDays = j.posted_at ? (Date.now() - new Date(j.posted_at).getTime()) / 86_400_000 : 30;
  const recency = Math.max(0, 1 - ageDays / 14);

  const score = Math.round(50 * skillOverlap + 20 * roleFit + 15 * locationFit + 10 * fresher + 5 * recency);
  return {
    score,
    reasons: {
      matched_skills: matched,
      missing_skills: j.skills.filter((s) => !mine.has(key(s))),
      role_fit: roleFit,
      location_fit: locationFit,
      fresher_friendly: !!j.fresher_friendly,
    },
  };
}
