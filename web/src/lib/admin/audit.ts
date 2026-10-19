import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";

/**
 * One audit_log row per admin change, with before and after values.
 * Flags and spend caps are written by SQL functions that insert their audit row in the same transaction
 * (admin_set_flag, admin_set_spend_cap); other admin writes call this right after the change.
 */
export async function audit(
  actorId: string,
  action: string,
  target: { table: string; id: string },
  before?: unknown,
  after?: unknown,
  db: SupabaseClient = adminClient(),
) {
  const { error } = await db
    .from("audit_log")
    .insert({ actor_id: actorId, action, target_table: target.table, target_id: target.id, before: before ?? null, after: after ?? null });
  if (error) console.error(`[audit] couldn't log ${action}: ${error.message}`);
}
