import Link from "next/link";
import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin";
import { shortDate } from "@/lib/format";

export default async function Drafts() {
  const { admin } = await requireAdmin();
  const { data } = await admin
    .from("article_drafts")
    .select("id, title, topic, kind, overlap_score, factcheck_passed, check_notes, status, created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  return (
    <>
      <h1 className="text-h1 font-bold">Review queue</h1>
      <p className="mb-6 mt-1 text-body text-ink-2">Nothing publishes without your approval. Fix every flagged issue before approving.</p>
      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-small">
          <thead className="border-b border-line text-ink-2">
            <tr>
              <th className="px-4 py-3 font-medium">Draft</th>
              <th className="px-4 py-3 font-medium">Overlap</th>
              <th className="px-4 py-3 font-medium">Fact check</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">
                  <Link href={`/admin/drafts/${d.id}`} className="font-medium text-ink underline-offset-4 hover:underline">{d.title}</Link>
                  <p className="text-ink-3">{d.kind === "guide" ? "Guide" : "News"} · {d.topic}{(d.check_notes as string[])?.length ? ` · ${(d.check_notes as string[]).length} issues` : ""}</p>
                </td>
                <td className={`tabular px-4 py-3 ${(d.overlap_score ?? 0) >= 8 ? "text-danger" : ""}`}>{d.overlap_score ?? "—"} words</td>
                <td className="px-4 py-3">{d.factcheck_passed ? <Badge tone="success">Passed</Badge> : <Badge tone="warning">Check</Badge>}</td>
                <td className="px-4 py-3 capitalize">{d.status}</td>
                <td className="px-4 py-3">{shortDate(d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && <p className="p-6 text-body text-ink-2">No drafts yet. The news pipeline runs every 6 hours.</p>}
      </div>
    </>
  );
}
