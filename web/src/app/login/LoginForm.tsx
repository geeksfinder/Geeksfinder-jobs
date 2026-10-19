"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Turnstile } from "@/components/app/Turnstile";
import { Button } from "@/components/ui/Button";
import { safeNext } from "@/lib/security-client";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"), "/onboarding");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Code length comes from Supabase's OTP setting (6 to 10 digits); the send route reports it
  const [digits, setDigits] = useState<number | null>(null);
  const [sent, setSent] = useState(false);
  const [consent, setConsent] = useState(false);
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState<"google" | "send" | "verify" | null>(null);

  const needConsent = () => {
    if (consent) return false;
    setErr("Tick the box to agree before continuing.");
    return true;
  };

  async function google() {
    if (needConsent()) return;
    setBusy("google");
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}&consent=1` },
    });
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    if (needConsent()) return;
    setBusy("send");
    setErr("");
    const res = await fetch("/api/auth/otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, turnstile: token, next }) });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setErr(data.error ?? "Couldn't send the code. Try again.");
    setDigits(typeof data.digits === "number" ? data.digits : null);
    setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy("verify");
    setErr("");
    const { error } = await createClient().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) {
      setBusy(null);
      setErr("That code didn't work. Check the latest email and try again.");
      setShake(true);
      setTimeout(() => setShake(false), 300);
      return;
    }
    await fetch("/auth/consent", { method: "POST" });
    // replace, not push: Back from the dashboard shouldn't reopen the login form
    location.replace(`/auth/continue?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="space-y-6">
      <label className="flex gap-3 text-small text-ink-2">
        <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErr(""); }} className="mt-0.5 size-5 shrink-0 accent-action" />
        <span>
          I agree that GeeksFinder processes my resume and profile to match jobs and tailor my resume, as described in the{" "}
          <Link href="/privacy" className="text-action underline underline-offset-2">Privacy Policy</Link> and{" "}
          <Link href="/terms" className="text-action underline underline-offset-2">Terms</Link>.
        </span>
      </label>

      <Button variant="secondary" className="w-full" loading={busy === "google"} onClick={google}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
        </svg>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-small text-ink-3" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      {!sent ? (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" required autoComplete="email" className="input" placeholder="priya@college.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={err ? "login-err" : undefined} />
          </div>
          <Turnstile onToken={setToken} />
          <Button type="submit" className="w-full" loading={busy === "send"} disabled={!email}>Email me a code</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p className="text-body text-ink-2">We sent a {digits ? `${digits}-digit ` : ""}code from GeeksFinder to <span className="font-semibold text-ink">{email}</span>.</p>
          <div className={shake ? "shake" : ""}>
            <label htmlFor="code" className="label">Code</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              className="input tabular tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={!!err || undefined}
              aria-describedby={err ? "login-err" : undefined}
            />
          </div>
          <Button type="submit" className="w-full" loading={busy === "verify"} disabled={code.length < (digits ?? 6)}>Log in</Button>
          <button type="button" onClick={() => { setSent(false); setCode(""); }} className="min-h-11 text-small text-action underline-offset-4 hover:underline">Use a different email</button>
        </form>
      )}
      {err && <p id="login-err" className="text-small text-danger" role="alert">{err}</p>}
    </div>
  );
}
