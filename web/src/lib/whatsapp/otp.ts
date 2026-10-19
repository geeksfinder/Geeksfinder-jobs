import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/** WhatsApp verification codes (SPEC.md W1.2): 6 digits, 10-minute expiry, 3 wrong tries. Only a hash is stored. */
export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_TRIES = 3;

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** Bound to the account, so a stored hash is useless for any other user. */
export const hashCode = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

export function codeMatches(userId: string, code: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(userId, code), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
