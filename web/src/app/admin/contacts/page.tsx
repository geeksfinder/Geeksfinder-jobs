import { Badge } from "@/components/ui/Highlighter";
import { requireAdmin } from "@/lib/admin/auth";
import { AREA_ROLES } from "@/lib/admin/constants";
import { companiesHiring } from "@/lib/company-pages";
import { shortDate } from "@/lib/format";
import { ContactToggle } from "./ContactToggle";
import { allRows } from "@/lib/supabase/all-rows";

/** HR contacts found by the finder chain. Flag do-not-contact to hide an address from every student. */
export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { admin } = await requireAdmin(AREA_ROLES.contacts);
  const { q } = await searchParams;
  let query = admin.from("company_contacts").select("id, company_domain, email, name, role, source, quality, verified, do_not_contact, opted_out_at").order("company_domain").limit(200);
  const term = (q ?? "").replace(/[%,()*\\]/g, "").trim();
  if (term) query = query.or(`email.ilike.%${term}%,company_domain.ilike.%${term}%,name.ilike.%${term}%`);
  const [{ data }, { count: total }, domainRows, hiring] = await Promise.all([
    query,
    admin.from("company_contacts").select("id", { count: "exact", head: true }).eq("do_not_contact", false),
    allRows<{ company_domain: string }>((a, b) => admin.from("company_contacts").select("company_domain").eq("do_not_contact", false).order("id").range(a, b)),
    companiesHiring(),
  ]);
  // Coverage: of the companies with live fresher jobs, how many have an HR email students can use
  const withContacts = new Set(domainRows.map((r) => r.company_domain));
  const { data: hiringRows } = hiring.length ? await admin.from("companies").select("domain, email_domains").in("domain", hiring.map((c) => c.domain)) : { data: [] };
  const covered = (hiringRows ?? []).filter((c) => [c.domain, ...((c.email_domains ?? []) as string[])].some((d) => withContacts.has(d))).length;

  return (
    <>
      <h1 className="text-h1 font-bold">HR contacts</h1>
      <p className="mt-1 text-body text-ink-2">Never share or export this list. Flagged addresses are hidden from every student.</p>
      <p className="mb-6 mt-2 text-small text-ink-2">
        <span className="tabular font-semibold text-ink">{(total ?? 0).toLocaleString("en-IN")}</span> usable contacts at{" "}
        <span className="tabular font-semibold text-ink">{withContacts.size.toLocaleString("en-IN")}</span> email domains ·{" "}
        <span className="tabular font-semibold text-ink">{covered}</span> of {hiring.length} companies with live fresher jobs have an HR email
      </p>
      <form className="mb-4 flex gap-2">
        <label htmlFor="cq" className="sr-only">Search</label>
        <input id="cq" name="q" defaultValue={q} placeholder="Search name, email or company domain" className="input max-w-sm" />
        <button className="h-11 rounded-control border border-line px-4 text-small font-medium hover:border-ink-3">Search</button>
      </form>
      <div className="panel overflow-x-auto">
        <table className="w-full text-left text-small">
          <thead className="border-b border-line text-ink-2">
            <tr><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Source</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {(data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{c.email}{c.name || c.role ? <span className="block text-ink-3">{[c.name, c.role].filter(Boolean).join(" · ")}</span> : null}</td>
                <td className="px-4 py-3">{c.company_domain}</td>
                <td className="px-4 py-3">{c.source}{c.verified ? " · verified" : c.quality === "older" ? " · older list" : ""}</td>
                <td className="px-4 py-3">
                  {c.do_not_contact ? <Badge tone="warning">{c.opted_out_at ? `Opted out ${shortDate(c.opted_out_at)}` : "Do not contact"}</Badge> : <Badge>Visible</Badge>}
                </td>
                <td className="px-4 py-3">{c.opted_out_at || c.source === "hr opt-out" || c.source === "hr removal request" ? null : <ContactToggle id={c.id} flagged={!!c.do_not_contact} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.length && <p className="p-6 text-body text-ink-2">No contacts yet. They appear as students use Email HR.</p>}
      </div>
    </>
  );
}
