import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

/**
 * Per-IP and per-user rate limits (plan §7). Uses Upstash Redis when configured;
 * falls back to an in-memory window for local dev (not shared across serverless instances).
 */
const RULES = {
  auth: { limit: 10, window: 60 }, // OTP sends / logins per IP per minute
  ai: { limit: 8, window: 60 }, // parse, tailor, drafts per user per minute
  email: { limit: 15, window: 86_400 }, // HR emails per user per day
  api: { limit: 60, window: 60 }, // general mutations per user per minute
  public: { limit: 20, window: 60 }, // public free tools per IP per minute
  report: { limit: 10, window: 86_400 }, // "Report this job" per user per day
  testAlert: { limit: 3, window: 86_400 }, // first-day "send a test alert" per user per day
  waStart: { limit: 3, window: 3_600 }, // WhatsApp codes per user, and per number, per hour (SPEC.md W1.2)
  waConfirm: { limit: 10, window: 3_600 }, // WhatsApp code checks per user per hour
  waSigFail: { limit: 10, window: 3_600 }, // forged webhook calls per hour before the owner is alerted
} as const;
export type Rule = keyof typeof RULES;

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
    : null;

const limiters = new Map<Rule, Ratelimit>();
function upstash(rule: Rule) {
  if (!redis) return null;
  let l = limiters.get(rule);
  if (!l) {
    const r = RULES[rule];
    l = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(r.limit, `${r.window} s`), prefix: `gf:${rule}` });
    limiters.set(rule, l);
  }
  return l;
}

const memory = new Map<string, number[]>();
export function memoryLimit(key: string, limit: number, windowSec: number, now = Date.now()) {
  const hits = (memory.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
  if (hits.length >= limit) {
    memory.set(key, hits);
    return { success: false, reset: hits[0] + windowSec * 1000 };
  }
  hits.push(now);
  memory.set(key, hits);
  return { success: true, reset: now + windowSec * 1000 };
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Returns true when allowed. `id` is a user id, or omitted to key by IP. */
export async function rateLimit(rule: Rule, id?: string): Promise<{ ok: boolean; retryAfter: number }> {
  const key = `${rule}:${id ?? `ip:${await clientIp()}`}`;
  const l = upstash(rule);
  const res = l ? await l.limit(key) : memoryLimit(key, RULES[rule].limit, RULES[rule].window);
  return { ok: res.success, retryAfter: Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)) };
}
