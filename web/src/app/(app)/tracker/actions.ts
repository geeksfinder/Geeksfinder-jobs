"use server";

import { revalidatePath } from "next/cache";
import { rateLimit } from "@/lib/ratelimit";
import { track } from "@/lib/events";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { StageBody } from "@/lib/validate";

export type Stage = "saved" | "applied" | "interview" | "offer" | "rejected";

/** Set an application's stage. With onlyIfNew, an existing row (e.g. already "applied") is left untouched. */
export async function setStage(jobId: string, stage: Stage, onlyIfNew = false) {
  const { supabase, user } = await requireUser();
  if (!user) throw new Error("unauthorized");
  const parsed = StageBody.safeParse({ jobId, stage });
  if (!parsed.success) throw new Error("bad request");
  if (!(await rateLimit("api", user.id)).ok) throw new Error("rate limited");

  const row = { user_id: user.id, job_id: parsed.data.jobId, stage: parsed.data.stage, updated_at: new Date().toISOString() };
  await supabase.from("applications").upsert(row, { onConflict: "user_id,job_id", ignoreDuplicates: onlyIfNew });
  if (parsed.data.stage === "applied") await track(adminClient(), "first_action", user.id, { action: "apply" });
  revalidatePath("/tracker");
}
