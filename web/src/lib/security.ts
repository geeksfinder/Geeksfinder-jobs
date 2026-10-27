import { NextResponse } from "next/server";

export { isPdf, safeNext } from "./security-client";

/** Remove newlines/control chars that enable header injection (email subject, names). */
export const oneLine = (s: string, max = 200) => s.replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

/** Redact emails and Indian phone numbers before anything goes to logs. */
export function redact(input: unknown): string {
  const s = typeof input === "string" ? input : input instanceof Error ? input.message : JSON.stringify(input);
  return (s ?? "")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g, "[phone]")
    .slice(0, 2000);
}

export const log = {
  error: (where: string, e: unknown) => console.error(`[${where}]`, redact(e)),
  warn: (where: string, e: unknown) => console.warn(`[${where}]`, redact(e)),
};

/** Generic client-facing error; details only in server logs. */
export function fail(where: string, e: unknown, message = "Something went wrong. Please try again.", status = 500) {
  log.error(where, e);
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => NextResponse.json({ error: "Please sign in again." }, { status: 401 });
export const badRequest = (message = "That request didn't look right.") => NextResponse.json({ error: message }, { status: 400 });
export const tooMany = (retryAfter = 60) =>
  NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

/** Error shape for the WhatsApp and admin APIs (SPEC.md §3): `{ error: { code, message } }`, the message saying how to fix it. */
export const apiError = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ error: { code, message } }, { status, headers });
