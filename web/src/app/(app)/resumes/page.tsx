import Link from "next/link";
import { likelyBranch } from "@/lib/skills";
import { ButtonLink } from "@/components/ui/Button";
import { shortDate } from "@/lib/format";
import { requireUser } from "@/lib/supabase/server";
import { ProfileEditor } from "./ProfileEditor";

export const metadata = { title: "Resumes" };

type Tailored = { id: string; created_at: string; jobs: { id: string; title: string; company: string } | null };

export default async function Resumes() {
  const { supabase, user } = await requireUser();
  const [{ data: p }, { data: u }, { data: tailored }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle(),
    supabase.from("users").select("name, phone").eq("id", user!.id).single(),
    supabase.from("tailored_resumes").select("id, created_at, jobs(id, title, company)").eq("user_id", user!.id).order("created_at", { ascending: false }).limit(50),
  ]);
  // Short-lived signed URL (10 min) for the original PDF in the private bucket
  const signed = p?.raw_resume_url ? (await supabase.storage.from("resumes").createSignedUrl(p.raw_resume_url, 600)).data?.signedUrl : null;

  return (
    <>
      <h1 className="text-h1 font-bold md:text-h1-lg">Resumes</h1>
      <p className="mt-1 text-body text-ink-2">Your base resume, and every version tailored to a job.</p>

      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-h2 font-semibold">Base resume</h2>
          <div className="flex gap-2">
            {signed && <a href={signed} target="_blank" rel="noopener" className="min-h-11 content-center text-small text-action underline-offset-4 hover:underline">View uploaded PDF</a>}
            <ButtonLink href="/onboarding?upload=1" size="sm" variant="secondary">Upload a new PDF</ButtonLink>
          </div>
        </div>
        {p ? (
          <ProfileEditor
            initial={{
              name: u?.name ?? "",
              phone: u?.phone ?? "",
              skills: p.skills ?? [],
              preferred_roles: p.preferred_roles ?? [],
              locations: p.locations ?? [],
              job_type: p.job_type ?? "full-time",
              branch: p.branch ?? likelyBranch(p.skills ?? []),
              experience_level: p.experience_level ?? "fresher",
              education: p.education ?? [],
              projects: p.projects ?? [],
              experience: p.experience ?? [],
            }}
          />
        ) : (
          <p className="text-body text-ink-2">
            No resume yet. <Link href="/onboarding?upload=1" className="text-action underline-offset-4 hover:underline">Upload your resume</Link> to get started.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-h2 font-semibold">Tailored resumes</h2>
        {tailored?.length ? (
          <ul className="panel divide-y divide-line">
            {(tailored as unknown as Tailored[]).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-body font-medium">{t.jobs?.title ?? "Job removed"}</p>
                  <p className="text-small text-ink-3">{t.jobs?.company} · {shortDate(t.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  {t.jobs && <ButtonLink href={`/apply/${t.jobs.id}?tab=tailor`} size="sm" variant="secondary">Review</ButtonLink>}
                  <a href={`/api/tailor/${t.id}/pdf`} className="inline-flex h-11 items-center rounded-control px-3 text-small font-medium text-action underline-offset-4 hover:underline md:h-9">Download PDF</a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-ink-2">Tailor your resume from any match and it will appear here.</p>
        )}
      </section>
    </>
  );
}
