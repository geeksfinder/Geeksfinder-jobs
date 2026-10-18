"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { audit, requireAdmin } from "@/lib/admin";
import { runChecks } from "@/lib/article-checks";
import { slugify } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";
import { SITE } from "@/lib/site";
import { esc, sendTelegram } from "@/lib/telegram";
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
    .update({ ...after, facts: { ...facts, freshers_note: note }, overlap_score: checks.overlap, factcheck_passed: checks.factcheck_passed, check_notes: checks.notes })
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

  const facts = d.facts as DraftFacts;
  const used =new Set(facts.used_source_urls?.length ? facts.used_source_urls : facts.facts.map((f) => f.source_url));
  const { data: items } = d.cluster_id ? await admin.from("news_items").select("url, title").eq("cluster_id", d.cluster_id) : { data: [] };
  // Guides cite only GeeksFinder's own job data, and only when they used a number from it
  const sources =
    d.kind === "guide"
      ? [...used].filter((u) => facts.facts.some((f) => f.source_url === u)).map((url) => ({ url, title: "GeeksFinder live job listings" }))
      : (items ?? []).filter((i) => used.has(i.url)).map((i) => ({ url: i.url, title: i.title }));
  const slug = `${slugify(d.title)}-${new Date().toISOString().slice(0, 10)}`;
  const reviewer = profile.name || "GeeksFinder editor";

  const { data: article, error } = await admin
    .from("articles")
    .insert({
      draft_id: d.id,
      slug,
      title: d.title,
      summary: d.summary,
      topic: d.topic,
      body_html: renderMarkdown(d.body_md ?? ""),
      freshers_note: renderMarkdown(facts.freshers_note ?? ""),
      sources,
      reviewer_name: reviewer,
      related_skills: (facts.related_skills ?? []).slice(0, 8),
    })
    .select("id, slug")
    .single();
  if (error) return { ok: false as const, error: "Couldn't publish — slug may already exist." };

  await admin.from("article_drafts").update({ status: "published", reviewer_id: user.id }).eq("id", d.id);
  await audit(user.id, "draft.approve", { table: "articles", id: article.id }, { status: "draft" }, { status: "published", slug });

  const url = `${SITE.url}/blog/${article.slug}`;
  if (process.env.TELEGRAM_CHANNEL_ID) {
    const ok = await sendTelegram(process.env.TELEGRAM_CHANNEL_ID, `<b>${esc(d.title)}</b>\n\n${esc(d.summary ?? "")}`, [[{ text: "Read on GeeksFinder", url }]]);
    if (ok) await admin.from("articles").update({ telegram_posted: true }).eq("id", article.id);
  }
  if (process.env.INDEXNOW_KEY) {
    // Bing/Yandex fast indexing; key is served at /api/indexnow-key
    fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${process.env.INDEXNOW_KEY}&keyLocation=${encodeURIComponent(`${SITE.url}/api/indexnow-key`)}`).catch(() => {});
  }
  revalidatePath("/blog");
  redirect(`/blog/${article.slug}`);
}
