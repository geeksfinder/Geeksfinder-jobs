import type { SupabaseClient } from "@supabase/supabase-js";

/** Cost of one delivered message, from wa_rate_card (never from code), with GST (SPEC.md §2 cost basis). */
export type WaCategory = "marketing" | "utility" | "authentication" | "service";
export type Rate = { category: WaCategory; inr_per_msg: number; gst_pct: number; effective_from: string };

export const isCategory = (v: unknown): v is WaCategory => v === "marketing" || v === "utility" || v === "authentication" || v === "service";

/** ₹ for one message at this rate, GST included, to 4 decimals. */
export function costWithGst(rate: Pick<Rate, "inr_per_msg" | "gst_pct">): number {
  return Math.round(Number(rate.inr_per_msg) * (1 + Number(rate.gst_pct) / 100) * 10_000) / 10_000;
}

/** The rate in force on `day` for a category: the newest row that started on or before it. */
export function pickRate(rates: Rate[], category: WaCategory, day: string): Rate | null {
  return rates.filter((r) => r.category === category && r.effective_from <= day).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] ?? null;
}

export async function messageCost(db: SupabaseClient, category: WaCategory, billable = true, day = new Date().toISOString().slice(0, 10)): Promise<number> {
  if (!billable) return 0;
  const { data } = await db.from("wa_rate_card").select("category, inr_per_msg, gst_pct, effective_from").eq("category", category).lte("effective_from", day);
  const rate = pickRate((data ?? []) as Rate[], category, day);
  if (!rate) throw new Error(`no WhatsApp rate for ${category} on ${day}`);
  return costWithGst(rate);
}

/** Today's date in India (YYYY-MM-DD): one digest per student per IST day. */
export const istDay = (now = Date.now()) => new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
