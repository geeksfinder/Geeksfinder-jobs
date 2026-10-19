import { Check, X } from "lucide-react";

const ROWS: [string, string][] = [
  ["Open six job sites every morning", "One message at 7:30 with the jobs that fit"],
  ["Guess whether you qualify", "A match score, and the skills you already have"],
  ["Send the same resume to 50 jobs", "A resume tuned for each job, using only what's true"],
  ["“Dear Sir/Madam” to careers@", "A short note to the person who hires"],
  ["Lose track in a spreadsheet", "Every application tracked, with a nudge to follow up"],
];

/** The old way vs the GeeksFinder way (DESIGN.md Landing): two columns, five rows, one framed panel. */
export function OldVsNew() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-panel bg-paper-2 p-6 md:p-8">
        <h3 className="text-h3 font-semibold text-ink-2">The old way</h3>
        <ul className="mt-5 space-y-4">
          {ROWS.map(([old]) => (
            <li key={old} className="flex gap-3 text-body text-ink-2">
              <X size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
              {old}
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-panel border-2 border-action bg-paper p-6 md:p-8">
        <h3 className="text-h3 font-semibold">With GeeksFinder</h3>
        <ul className="mt-5 space-y-4">
          {ROWS.map(([, now]) => (
            <li key={now} className="flex gap-3 text-body text-ink">
              <Check size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-success" aria-hidden />
              {now}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
