"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export type Field =
  | { name: string; label: string; type: "text" | "email"; placeholder?: string; required?: boolean; defaultValue?: string }
  | { name: string; label: string; type: "number"; min?: number; max?: number; step?: number; required?: boolean; defaultValue?: number }
  | { name: string; label: string; type: "select"; options: { value: string; label: string }[]; defaultValue?: string }
  | { name: string; label: string; type: "checkbox"; defaultChecked?: boolean };

type Props = {
  /** /api/admin/... POST route */
  action: string;
  label: string;
  /** Toast on success, reusing the button's verb ("Saved", "Sends paused") */
  success: string;
  fields?: Field[];
  /** Sent with every request */
  extra?: Record<string, unknown>;
  variant?: "primary" | "secondary" | "danger" | "text";
  /** Type-to-confirm (DESIGN.md Admin): the admin must type this word; it is sent as `confirm` */
  confirmWord?: string;
  confirmText?: string;
  inline?: boolean;
};

type ErrorBody = { error?: string | { message?: string } };

/** Every admin write: a small form that POSTs JSON to an audited /api/admin route and refreshes the page. */
export function AdminAction({ action, label, success, fields = [], extra = {}, variant = "secondary", confirmWord, confirmText, inline }: Props) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);

  async function send(confirm?: string) {
    const form = formRef.current;
    const body: Record<string, unknown> = { ...extra };
    for (const f of fields) {
      const el = form?.elements.namedItem(f.name) as HTMLInputElement | HTMLSelectElement | null;
      if (!el) continue;
      if (f.type === "checkbox") body[f.name] = (el as HTMLInputElement).checked;
      else if (f.type === "number") body[f.name] = el.value === "" ? null : Number(el.value);
      else body[f.name] = el.value;
    }
    if (confirm !== undefined) body.confirm = confirm;
    setPending(true);
    try {
      const res = await fetch(action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as ErrorBody;
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : data.error?.message;
        toast(msg ?? "That didn't save. Try again.", "error");
        return;
      }
      toast(success);
      dialog.current?.close();
      setTyped("");
      router.refresh();
    } catch {
      toast("No connection. Check your internet and try again.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmWord) dialog.current?.showModal();
          else void send();
        }}
        className={inline ? "inline-flex flex-wrap items-end gap-2" : "flex flex-wrap items-end gap-3"}
      >
        {fields.map((f) =>
          f.type === "checkbox" ? (
            <label key={f.name} className="flex min-h-11 items-center gap-2 text-small text-ink">
              <input type="checkbox" name={f.name} defaultChecked={f.defaultChecked} className="size-4 accent-action" />
              {f.label}
            </label>
          ) : (
            <div key={f.name} className={f.type === "number" ? "w-28" : "min-w-48 flex-1"}>
              <label htmlFor={`${id}-${f.name}`} className="label">{f.label}</label>
              {f.type === "select" ? (
                <select id={`${id}-${f.name}`} name={f.name} defaultValue={f.defaultValue} className="input">
                  {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  id={`${id}-${f.name}`}
                  name={f.name}
                  type={f.type}
                  required={"required" in f ? f.required : undefined}
                  placeholder={"placeholder" in f ? f.placeholder : undefined}
                  min={f.type === "number" ? f.min : undefined}
                  max={f.type === "number" ? f.max : undefined}
                  step={f.type === "number" ? f.step : undefined}
                  defaultValue={f.defaultValue}
                  className="input"
                />
              )}
            </div>
          ),
        )}
        <Button type="submit" variant={variant} size="sm" loading={pending && !confirmWord}>{label}</Button>
      </form>

      {confirmWord && (
        <dialog ref={dialog} aria-labelledby={`${id}-title`} className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-panel border border-line bg-paper p-6 shadow-float backdrop:bg-ink/40">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(typed);
            }}
          >
            <h2 id={`${id}-title`} className="text-h3 font-semibold">{label}</h2>
            {confirmText && <p className="mt-2 text-body text-ink-2">{confirmText}</p>}
            <label htmlFor={`${id}-confirm`} className="label mt-4">
              Type <span className="font-semibold">{confirmWord}</span> to confirm
            </label>
            <input id={`${id}-confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="input" />
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => { dialog.current?.close(); setTyped(""); }}>Keep as is</Button>
              <Button type="submit" variant="danger" size="sm" disabled={typed !== confirmWord} loading={pending}>{label}</Button>
            </div>
          </form>
        </dialog>
      )}
    </>
  );
}
