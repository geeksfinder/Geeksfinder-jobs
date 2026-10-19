import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "../supabase/admin";
import { adminAlert } from "./alerts";

export type CronCounts = Record<string, number | string | boolean>;
export type CronContext = { warn: (message: string) => void };

/**
 * Every script in web/scripts runs inside this: one cron_runs row with start, finish, status, counts and error.
 * A run that throws is marked failed and the owner gets a Telegram alert; warnings mark it "warning".
 * Logging problems never stop the job itself.
 */
export async function withCronRun(
  job: string,
  fn: (ctx: CronContext) => Promise<CronCounts | void>,
  db: SupabaseClient = adminClient(),
): Promise<CronCounts> {
  const warnings: string[] = [];
  const ctx: CronContext = {
    warn: (m) => {
      warnings.push(m);
      console.warn(`[${job}] ${m}`);
    },
  };
  const { data: row, error } = await db.from("cron_runs").insert({ job }).select("id").single();
  if (error) console.warn(`[cron-run] couldn't log start of ${job}: ${error.message}`);
  const finish = async (fields: Record<string, unknown>) => {
    if (!row) return;
    const { error: e } = await db.from("cron_runs").update({ finished_at: new Date().toISOString(), ...fields }).eq("id", row.id);
    if (e) console.warn(`[cron-run] couldn't log end of ${job}: ${e.message}`);
  };

  try {
    const counts = (await fn(ctx)) ?? {};
    await finish({ status: warnings.length ? "warning" : "ok", counts, error: warnings.length ? warnings.join("\n").slice(0, 2000) : null });
    return counts;
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 2000);
    await finish({ status: "failed", error: message });
    await adminAlert(`Cron "${job}" failed: ${message.slice(0, 300)}`, db);
    throw e;
  }
}
