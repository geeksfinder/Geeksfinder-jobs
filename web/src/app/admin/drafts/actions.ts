"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { runChecks } from "@/lib/article-checks";
import { publishDraft } from "@/lib/publish";
import { DraftEditBody, ReviewBody } from "@/lib/validate";

type DraftFacts = { facts: { fact: string; source_url: string }[]; related_skills?: string[]; freshers_note?: string; used_source_urls?: string[] };

export async function saveDraft(input: { id: string; title: string; summary: string; body_md: string; freshers_note: string }) {
  const { user, admin } = await requireAdmin();
  const parsed = DraftEditBody.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };
  const { data: before } = await admin.from("article_drafts").select("title, summary, body_md, facts, cluster_id").eq("id", parsed.data.id).single();
  if (!before) return { ok: false as const, error: "Draft not found" };

  const facts = before.facts as DraftFacts;
  // Guides have no news cluster: nothing to compare for copying
  const { data: items } = before.cluster_id ? await admin.from("news_items").select("title, text").eq("cluster_id", before.cluster_id) : { data: [] };
  const note = input.freshers_note.slice(0, 4000);
  const checks = runChecks(parsed.data.body_md, note, facts.facts.map((f) => f.fact), (items ?? []).map((i) => `${i.title}\n${i.text}`));
  const after = { title: parsed.data.title, summary: parsed.data.summary, body_md: parsed.data.body_md };
  await admin
    .from("article_drafts")
    // Clearing the review makes the pipeline re-review the edited version (and publish it if it now passes)
    .update({ ...after, facts: { ...facts, freshers_note: note }, overlap_score: checks.overlap, factcheck_passed: checks.factcheck_passed, check_notes: checks.notes, review: null })
    .eq("id", parsed.data.id);
  await audit(user.id, "draft.edit", { table: "article_drafts", id: parsed.data.id }, { title: before.title, summary: before.summary }, after);
  revalidatePath(`/admin/drafts/${parsed.data.id}`);
  return { ok: true as const, checks };
}

export async function reviewDraft(input: { id: string; action: "approve" | "reject" }) {
  const { user, admin, profile } = await requireAdmin();
  const parsed = ReviewBody.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Bad request" };
  const { data: d } = await admin.from("article_drafts").select("*").eq("id", parsed.data.id).single();
  if (!d || d.status !== "draft") return { ok: false as const, error: "Already reviewed" };

  if (parsed.data.action === "reject") {
    await admin.from("article_drafts").update({ status: "rejected", reviewer_id: user.id }).eq("id", d.id);
    await audit(user.id, "draft.reject", { table: "article_drafts", id: d.id }, { status: "draft" }, { status: "rejected" });
    redirect("/admin/drafts");
  }

  // Hard rule (plan §6): never publish a run of 8+ words copied from a source
  if ((d.overlap_score ?? 0) >= 8) return { ok: false as const, error: "Rewrite the copied passage (8+ words shared with a source), then save and re-check." };

  const res = await publishDraft(admin, d, profile.name || "GeeksFinder editor", user.id);
  if (!res.ok) return { ok: false as const, error: res.error };
  await audit(user.id, "draft.approve", { table: "articles", id: res.id }, { status: "draft" }, { status: "published", slug: res.slug });
  revalidatePath("/blog");
  redirect(`/blog/${res.slug}`);
}
