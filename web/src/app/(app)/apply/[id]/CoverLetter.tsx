"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Below the tailored resume: write a cover letter from it, edit it in place, download it as a PDF or copy it.
 * It comes with the tailored resume (no extra credit). Edits are saved before every download and copy.
 */
export function CoverLetter({ jobId }: { jobId: string }) {
  const [letter, setLetter] = useState<{ id: string; body: string } | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"write" | "pdf" | null>(null);
  const [err, setErr] = useState("");
  const toast = useToast();

  async function write() {
    setBusy("write");
    setErr("");
    const res = await fetch("/api/cover-letter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setErr(data.error ?? "Something went wrong.");
    setLetter(data);
    setText(data.body);
    toast("Cover letter written");
  }

  /** Save edits first, so the PDF and the copy are exactly what's on screen. */
  async function save() {
    if (!letter || text === letter.body) return true;
    const res = await fetch("/api/cover-letter", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, body: text }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? "Couldn't save your edits. Try again.");
      return false;
    }
    setLetter({ ...letter, body: text });
    return true;
  }

  async function download() {
    if (!letter) return;
    setBusy("pdf");
    setErr("");
    const ok = await save();
    const res = ok ? await fetch(`/api/cover-letter/${letter.id}/pdf`) : null;
    setBusy(null);
    if (!res) return;
    if (!res.ok) return toast("Couldn't create the PDF. Try again.", "error");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "cover-letter.pdf";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("PDF downloaded");
  }

  async function copy() {
    setErr("");
    if (!(await save())) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Cover letter copied");
    } catch {
      toast("Couldn't copy. Select the text and copy it instead.", "error");
    }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <section aria-labelledby="cover-letter" className="mt-10 border-t border-line pt-8">
      <h2 id="cover-letter" className="text-h3 font-semibold">Cover letter</h2>
      {!letter ? (
        <>
          <p className="mt-1 max-w-[60ch] text-body text-ink-2">
            Many core and PSU jobs ask for one. We write it from your tailored resume, using only what&apos;s on it. It comes with this tailored resume.
          </p>
          <Button variant="secondary" className="mt-4" loading={busy === "write"} onClick={write}>Write a cover letter</Button>
          {busy === "write" && <p className="mt-2 text-small text-ink-2">This takes about 15 seconds.</p>}
        </>
      ) : (
        <>
          <p className="mt-1 max-w-[60ch] text-body text-ink-2">Read it as the hiring manager would. Change anything that doesn&apos;t sound like you.</p>
          <label htmlFor="cover-text" className="sr-only">Cover letter text</label>
          <textarea
            id="cover-text"
            rows={16}
            maxLength={5000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby="cover-count"
            className="input mt-4 h-auto py-3 font-serif text-resume"
          />
          <p id="cover-count" className="mt-1.5 text-small text-ink-2">
            <span className="tabular">{words}</span> words{words > 300 ? ". Shorter letters get read: aim for 180 to 250." : ""}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" loading={busy === "pdf"} onClick={download}>Download PDF</Button>
            <Button variant="text" onClick={copy}>Copy</Button>
          </div>
        </>
      )}
      {err && <p className="mt-3 text-small text-danger" role="alert">{err}</p>}
    </section>
  );
}
