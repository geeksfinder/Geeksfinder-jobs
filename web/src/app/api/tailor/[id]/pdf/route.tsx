import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { pdf as s } from "@/lib/pdf-styles";
import type { ParsedResume } from "@/lib/ai";
import { applyChoices, loadResume } from "@/lib/resume";
import { adminRole } from "@/lib/admin/auth";
import { log } from "@/lib/security";
import { adminClient, requireUser } from "@/lib/supabase/server";
import { TailorPdfBody, uuid } from "@/lib/validate";

export const runtime = "nodejs";

function ResumePDF({ r }: { r: ParsedResume }) {
  return (
    <Document title={`${r.name} — Resume`} author={r.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{r.name}</Text>
        <Text style={s.contact}>{[r.email, r.phone].filter(Boolean).join("  |  ")}</Text>
        {r.summary ? (<><Text style={s.h}>SUMMARY</Text><Text>{r.summary}</Text></>) : null}
        <Text style={s.h}>SKILLS</Text>
        <Text>{r.skills.join(", ")}</Text>
        {r.experience.length > 0 && <Text style={s.h}>EXPERIENCE</Text>}
        {r.experience.map((e, i) => (
          <View key={i} style={s.item}>
            <Text style={s.bold}>{e.role} — {e.company}{e.duration ? `  (${e.duration})` : ""}</Text>
            {e.bullets.map((b, j) => <Text key={j}>• {b}</Text>)}
          </View>
        ))}
        {r.projects.length > 0 && <Text style={s.h}>PROJECTS</Text>}
        {r.projects.map((p, i) => (
          <View key={i} style={s.item}>
            <Text style={s.bold}>{p.name}{p.tech?.length ? `  |  ${p.tech.join(", ")}` : ""}</Text>
            <Text>{p.description}</Text>
          </View>
        ))}
        {r.education.length > 0 && <Text style={s.h}>EDUCATION</Text>}
        {r.education.map((e, i) => (
          <Text key={i}>{e.degree}, {e.institution}{e.year ? ` — ${e.year}` : ""}{e.score ? `  (${e.score})` : ""}</Text>
        ))}
      </Page>
    </Document>
  );
}

async function render(id: string, accepted?: Record<string, string>) {
  const { supabase, user } = await requireUser();
  if (!user) return new Response("Please sign in again.", { status: 401 });
  if (!uuid.safeParse(id).success) return new Response("Not found", { status: 404 });
  // RLS + explicit owner filter: another user's id returns nothing (no IDOR)
  const { data } = await supabase.from("tailored_resumes").select("content, jobs(company)").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!data) return new Response("Not found", { status: 404 });

  const tailored = data.content as ParsedResume;
  const original = accepted ? await loadResume(supabase, user.id) : null;
  const resume = original ? applyChoices(original, tailored, accepted) : tailored;
  let buf: Buffer;
  try {
    buf = await renderToBuffer(<ResumePDF r={resume} />);
  } catch (e) {
    // Logged for Vercel; admins also see the reason, so a failure in production can be diagnosed without log access
    log.error("tailor.pdf", e);
    const detail = (await adminRole(adminClient(), user.id)) ? ` (${(e as Error).message})` : "";
    return new Response(`Couldn't create the PDF. Try again.${detail}`, { status: 500 });
  }
  const company = ((data.jobs as unknown as { company: string } | null)?.company ?? "job").replace(/[^a-z0-9]+/gi, "_");
  const name = (resume.name || "Resume").replace(/[^a-z0-9]+/gi, "_");
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}_${company}.pdf"`, "Cache-Control": "no-store" },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return render((await params).id);
}

/** POST with { accepted } applies the student's per-line Undo choices before rendering. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = TailorPdfBody.safeParse(await req.json().catch(() => ({})));
  return render((await params).id, body.success ? body.data.accepted : undefined);
}
