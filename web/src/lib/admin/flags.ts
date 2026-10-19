import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";
import type { FlagKey } from "./constants";

export { FLAGS, type FlagKey } from "./constants";

// Kill switches are checked inside the code that sends or spends, before each batch
const TTL_MS = 30_000;
// WhatsApp costs money per message: if the switch can't be read, don't send
const FAIL_CLOSED: ReadonlySet<FlagKey> = new Set(["whatsapp_sends"]);
const cache = new Map<FlagKey, { on: boolean; at: number }>();

/** true = allowed. Cached for 30 seconds; a missing row means the switch was never turned off. */
export async function getFlag(key: FlagKey, db: SupabaseClient = adminClient(), now = Date.now()): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.on;
  const { data, error } = await db.from("app_flags").select("enabled").eq("key", key).maybeSingle();
  if (error) {
    console.warn(`[flags] couldn't read ${key}: ${error.message}`);
    return hit?.on ?? !FAIL_CLOSED.has(key);
  }
  const on = data ? data.enabled !== false : true;
  cache.set(key, { on, at: now });
  return on;
}

/** After an admin changes a switch, and in tests. */
export function clearFlagCache() {
  cache.clear();
}
