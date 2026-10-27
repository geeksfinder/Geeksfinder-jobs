import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { fileName, pdf as s } from "@/lib/pdf-styles";
import { requireUser } from "@/lib/supabase/server";
import { uuid } from "@/lib/validate";

export const runtime = "nodejs";

/** Name and contact on top (same as the tailored resume), today's date, then the letter as the student saved it. */
function LetterPDF({ name, contact, date, body }: { name: string; contact: string; date: string; body: string }) {
  return (
    <Document title={`${name} — Cover letter`} author={name}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{name}</Text>
        {contact ? <Text style={s.contact}>{contact}</Text> : null}
        <Text style={[s.letter, { marginTop: 18, marginBottom: 14 }]}>{date}</Text>
        {body.split(/\n\s*\n/).map((p, i) => (
          <Text key={i} style={[s.letter, s.para]}>{p.trim()}</Text>
        ))}
      </Page>
    </Document>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await requireUser();
  if (!user) return new Response("Please sign in again.", { status: 401 });
  const { id } = await params;
  if (!uuid.safeParse(id).success) return new Response("Not found", { status: 404 });
  // RLS + explicit owner filter: another student's letter returns nothing (no IDOR)
  const { data } = await supabase.from("cover_letters").select("body, jobs(company), tailored_resumes(content)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });

  const resume = (data.tailored_resumes as unknown as { content: { name?: string; email?: string; phone?: string } } | null)?.content ?? {};
  const name = resume.name || "Cover letter";
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const buf = await renderToBuffer(<LetterPDF name={name} contact={[resume.email, resume.phone].filter(Boolean).join("  |  ")} date={date} body={data.body} />);
  const company = (data.jobs as unknown as { company: string } | null)?.company ?? "job";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName(name, "Cover_letter", company)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
