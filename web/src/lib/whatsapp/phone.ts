import { z } from "zod";

/**
 * Phone numbers (SPEC.md §3, W1.1): stored as E.164, India (+91) by default. Indian mobiles are 10 digits starting
 * 6–9. Anything with letters, or too short or long, is rejected rather than guessed.
 */
export function toE164(input: string): string | null {
  const raw = input.trim();
  if (!raw || /[^\d\s()+.-]/.test(raw)) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.lastIndexOf("+") > 0) return null;

  let e164: string;
  if (digits.startsWith("+")) e164 = digits;
  else if (/^0\d{10}$/.test(digits)) e164 = `+91${digits.slice(1)}`; // trunk prefix: 098…
  else if (/^91\d{10}$/.test(digits)) e164 = `+${digits}`;
  else if (/^\d{10}$/.test(digits)) e164 = `+91${digits}`;
  else return null;

  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  if (e164.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(e164)) return null;
  return e164;
}

export const PhoneSchema = z
  .string()
  .max(20, "Enter a 10-digit mobile number.")
  .transform((v, ctx) => {
    const e = toE164(v);
    if (!e) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit mobile number, like 98765 43210." });
      return z.NEVER;
    }
    return e;
  });

/**
 * "98xxxxxx21": first two and last two digits of the national number. The only form a phone number may take in the
 * admin panel and in logs (SPEC.md §1).
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  const national = phone.trim().startsWith("+91") || (digits.length === 12 && digits.startsWith("91")) ? digits.slice(2) : digits;
  if (national.length < 6) return "x".repeat(national.length);
  return `${national.slice(0, 2)}${"x".repeat(national.length - 4)}${national.slice(-2)}`;
}
