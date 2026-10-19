import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { uuid } from "@/lib/validate";
import { DraftEditor } from "./DraftEditor";

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requireAdmin(AREA_ROLES.drafts);
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { data: d } = await admin.from("article_drafts").select("*").eq("id", id).maybeSingle();
  if (!d) notFound();
  const facts = d.facts as { facts: { fact: string; source_url: string }[]; freshers_note?: string };
  const review = d.review as {
    seo_score?: number;
    ai?: { helpfulness: number; reads_natural: number; accuracy_risk: string; issues: string[] } | null;
    held_because?: string[];
  } | null;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <DraftEditor
        draft={{ id: d.id, title: d.title ?? "", summary: d.summary ?? "", body_md: d.body_md ?? "", freshers_note: facts.freshers_note ?? "", status: d.status }}
        initialNotes={(d.check_notes as string[]) ?? []}
        overlap={d.overlap_score ?? 0}
      />
      <aside>
        {review && (
          <section className="mb-8 rounded-panel bg-paper-2 p-4" aria-labelledby="auto-review">
            <h2 id="auto-review" className="text-h3 font-semibold">Automatic review</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-small">
              <dt className="text-ink-2">SEO</dt>
              <dd className="tabular text-right font-semibold">{review.seo_score ?? "—"}/100</dd>
              <dt className="text-ink-2">Helpfulness</dt>
              <dd className="tabular text-right font-semibold">{review.ai ? `${review.ai.helpfulness}/10` : "—"}</dd>
              <dt className="text-ink-2">Reads naturally</dt>
              <dd className="tabular text-right font-semibold">{review.ai ? `${review.ai.reads_natural}/10` : "—"}</dd>
              <dt className="text-ink-2">Accuracy risk</dt>
              <dd className={`text-right font-semibold capitalize ${review.ai?.accuracy_risk === "low" ? "text-success" : "text-warning"}`}>{review.ai?.accuracy_risk ?? "—"}</dd>
            </dl>
            {d.auto_published ? (
              <p className="mt-3 text-small text-success">Passed every check and was published automatically.</p>
            ) : review.held_because?.length ? (
              <>
                <p className="mt-3 text-small font-semibold">Held for your review because:</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-small text-ink-2">
                  {review.held_because.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </>
            ) : null}
          </section>
        )}
        <h2 className="mb-3 text-h3 font-semibold">Fact list ({facts.facts.length})</h2>
        <ol className="space-y-2 text-small text-ink-2">
          {facts.facts.map((f, i) => (
            <li key={i} className="border-b border-line pb-2">
              {f.fact}{" "}
              <a href={f.source_url} target="_blank" rel="noopener nofollow" className="text-action underline-offset-2 hover:underline">
                {(() => { try { return new URL(f.source_url).hostname.replace(/^www\./, ""); } catch { return "source"; } })()}
              </a>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
