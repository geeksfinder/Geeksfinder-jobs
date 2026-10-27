"use client";

import { X } from "lucide-react";
import { useId, useState } from "react";

/**
 * Editable list of short values (skills, roles, cities). Enter or comma adds; Backspace on empty removes last.
 * Long suggestion lists show 8 at a time, narrowed by what's typed. `normalize` tidies a value as it's added
 * (cities: "banglore" → "Bengaluru").
 */
const SHOWN = 8;

/** Suggestions not already added that fit what's typed, under either spelling ("banglore" offers Bengaluru). */
export function offeredSuggestions(suggestions: string[], values: string[], draft: string, normalize?: (v: string) => string) {
  const q = draft.trim().toLowerCase();
  const tidy = q && normalize ? normalize(draft.trim()).toLowerCase() : "";
  return suggestions
    .filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()))
    .filter((s) => !q || s.toLowerCase().includes(q) || (tidy && s.toLowerCase().includes(tidy)))
    .slice(0, SHOWN);
}

export function TagInput({
  label,
  hint,
  values,
  onChange,
  placeholder,
  suggestions = [],
  max = 60,
  error,
  normalize,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
  error?: string;
  normalize?: (v: string) => string;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const typed = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    const v = typed && normalize ? normalize(typed) : typed;
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase()) || values.length >= max) return;
    onChange([...values, v]);
  };

  const offered = offeredSuggestions(suggestions, values, draft, normalize);

  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {hint && <p id={`${id}-hint`} className="-mt-1 mb-2 text-small text-ink-2">{hint}</p>}
      <div className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-control border bg-paper-2 p-1.5 focus-within:border-action focus-within:bg-paper ${error ? "border-danger" : "border-line"}`}>
        {values.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1 rounded-chip border border-line bg-paper pl-2 text-small">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="grid size-8 place-items-center text-ink-3 hover:text-ink">
              <X size={14} strokeWidth={1.5} aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(",")) { v.split(",").forEach(add); setDraft(""); } else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); setDraft(""); }
            if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => { add(draft); setDraft(""); }}
          placeholder={values.length ? "" : placeholder}
          aria-invalid={!!error || undefined}
          aria-describedby={[hint && `${id}-hint`, error && `${id}-err`].filter(Boolean).join(" ") || undefined}
          className="h-8 min-w-32 flex-1 bg-transparent px-1.5 text-body outline-none placeholder:text-ink-3"
        />
      </div>
      {error && <p id={`${id}-err`} className="mt-1.5 text-small text-danger">{error}</p>}
      {offered.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {offered.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="h-8 rounded-chip border border-dashed border-line px-2 text-small text-ink-2 hover:border-ink-3 hover:text-ink">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
