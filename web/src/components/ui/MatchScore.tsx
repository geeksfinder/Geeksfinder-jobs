export type MatchReasons = {
  matched_skills?: string[];
  missing_skills?: string[];
  role_fit?: number;
  location_fit?: number;
  fresher_friendly?: boolean;
};

export function reasonText(r: MatchReasons, city?: string | null) {
  const have = r.matched_skills?.length ?? 0;
  const total = have + (r.missing_skills?.length ?? 0);
  return [
    total ? `${have} of ${total} skills` : null,
    r.fresher_friendly ? "Fresher role" : null,
    r.location_fit ? city || "Location fits" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What keeps a close fit under 60, for "Worth a look": "Needs SolidWorks and CATIA · Outside your cities". */
export function gapText(r: MatchReasons) {
  const missing = r.missing_skills ?? [];
  const skills =
    missing.length === 0 ? null
    : missing.length <= 2 ? `Needs ${missing.join(" and ")}`
    : `Needs ${missing.slice(0, 2).join(", ")} and ${missing.length - 2} more`;
  return [skills, r.location_fit === 0 ? "Outside your cities" : null, r.role_fit === 0 ? "A different role from yours" : null].filter(Boolean).join(" · ");
}

/** "87% match" — a number, not a fake ring. Hidden below 60. */
export function MatchScore({ score, reasons, city }: { score: number; reasons?: MatchReasons; city?: string | null }) {
  if (score < 60) return null;
  const tip = reasons ? reasonText(reasons, city) : "";
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={tip ? 0 : undefined}
        aria-label={tip ? `${score}% match: ${tip}` : `${score}% match`}
        className={`tabular whitespace-nowrap text-body font-semibold ${score >= 80 ? "text-success" : "text-ink"}`}
      >
        {score}% match
      </span>
      {tip && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max max-w-60 rounded-control bg-ink px-2.5 py-1.5 text-tiny text-white opacity-0 shadow-float transition-opacity duration-[180ms] group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {tip}
        </span>
      )}
    </span>
  );
}
