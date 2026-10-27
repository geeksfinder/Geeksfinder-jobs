"use client";

import { FileUp } from "lucide-react";
import { useId, useState } from "react";
import { resumePdfText } from "@/lib/pdf-text";

/**
 * "Choose your resume PDF" box for the free tools, styled like the onboarding upload. The PDF is read in the
 * browser and its text handed back to fill the tool's resume field, which stays editable (paste still works).
 * `note` says what happens to the text next: the ATS checker keeps it on the device, the HR email tool sends it.
 */
export function ResumeUpload({ onText, note }: { onText: (text: string) => void; note: string }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; words: number } | null>(null);
  const [err, setErr] = useState("");

  async function pick(file: File) {
    setBusy(true);
    setErr("");
    setDone(null);
    const r = await resumePdfText(file);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    onText(r.text);
    setDone({ name: file.name, words: r.words });
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-pointer flex-col items-center rounded-panel border border-dashed border-line bg-paper-2 px-6 py-6 text-center hover:border-ink-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-action"
      >
        <FileUp size={24} strokeWidth={1.5} className="text-ink-2" aria-hidden />
        <span className="mt-2 text-body font-semibold">{busy ? "Reading your PDF…" : done ? "Choose a different PDF" : "Choose your resume PDF"}</span>
        <span className="text-small text-ink-2">{note}</span>
        <input id={id} type="file" accept="application/pdf,.pdf" className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      </label>
      <div aria-live="polite">
        {done && (
          <p className="mt-2 text-small text-ink-2">
            Read <span className="tabular">{done.words}</span> words from {done.name}. Check the text below and fix anything that came out wrong.
          </p>
        )}
        {err && <p className="mt-2 text-small text-danger" role="alert">{err}</p>}
      </div>
    </div>
  );
}
