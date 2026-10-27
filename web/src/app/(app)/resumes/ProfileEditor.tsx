"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveProfile } from "@/app/onboarding/actions";
import { TagInput } from "@/components/app/TagInput";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { suggestRoles } from "@/lib/branches";
import { INDIA_CITIES, tidyCity } from "@/lib/cities";
import type { ProfileInput } from "@/lib/validate";

export function ProfileEditor({ initial }: { initial: ProfileInput }) {
  const [p, setP] = useState<ProfileInput>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const toast = useToast();
  const set = <K extends keyof ProfileInput>(k: K, v: ProfileInput[K]) => setP((x) => ({ ...x, [k]: v }));

  return (
    <form
      className="panel space-y-6 p-5 md:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const r = await saveProfile(p);
          if (r.ok) toast("Profile saved");
          else setError(r.error);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-name" className="label">Name</label>
          <input id="pf-name" className="input" value={p.name} onChange={(e) => set("name", e.target.value)} maxLength={100} />
        </div>
        <div>
          <label htmlFor="pf-phone" className="label">Phone</label>
          <input id="pf-phone" className="input" inputMode="tel" value={p.phone} onChange={(e) => set("phone", e.target.value)} maxLength={20} />
        </div>
      </div>

      <TagInput label="Skills" values={p.skills} onChange={(v) => set("skills", v)} placeholder="Add a skill" />
      <TagInput label="Roles you want" values={p.preferred_roles} onChange={(v) => set("preferred_roles", v)} placeholder={suggestRoles(p.skills)[0]} suggestions={suggestRoles(p.skills)} max={10} />
      <TagInput label="Cities" hint="Add Remote to include remote jobs." values={p.locations} onChange={(v) => set("locations", v)} placeholder="Pune" suggestions={INDIA_CITIES} normalize={tidyCity} max={10} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-type" className="label">Job type</label>
          <select id="pf-type" className="input" value={p.job_type} onChange={(e) => set("job_type", e.target.value as ProfileInput["job_type"])}>
            <option value="full-time">Full-time</option>
            <option value="internship">Internship</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label htmlFor="pf-exp" className="label">Experience</label>
          <select id="pf-exp" className="input" value={p.experience_level} onChange={(e) => set("experience_level", e.target.value as ProfileInput["experience_level"])}>
            <option value="fresher">Fresher / final year</option>
            <option value="0-1">0–1 year</option>
            <option value="1-3">1–3 years</option>
          </select>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="label">Education</legend>
        {p.education.map((ed, i) => (
          <div key={i} className="grid gap-2 rounded-control border border-line p-3 sm:grid-cols-[2fr_2fr_1fr_1fr_auto]">
            {(["institution", "degree", "year", "score"] as const).map((k) => (
              <div key={k}>
                <label className="sr-only" htmlFor={`ed-${i}-${k}`}>{k}</label>
                <input id={`ed-${i}-${k}`} className="input" placeholder={k === "score" ? "CGPA / %" : k[0].toUpperCase() + k.slice(1)} value={ed[k] ?? ""} onChange={(e) => set("education", p.education.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
              </div>
            ))}
            <button type="button" aria-label="Remove education" onClick={() => set("education", p.education.filter((_, j) => j !== i))} className="grid size-11 place-items-center text-ink-3 hover:text-danger">
              <Trash2 size={20} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        ))}
        <Button type="button" variant="text" onClick={() => set("education", [...p.education, { institution: "", degree: "", year: "", score: "" }])}>
          <Plus size={16} strokeWidth={1.5} aria-hidden /> Add education
        </Button>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="label">Projects</legend>
        {p.projects.map((pr, i) => (
          <div key={i} className="space-y-2 rounded-control border border-line p-3">
            <div className="flex gap-2">
              <label className="sr-only" htmlFor={`pr-${i}-name`}>Project name</label>
              <input id={`pr-${i}-name`} className="input" placeholder="Project name" value={pr.name} onChange={(e) => set("projects", p.projects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <button type="button" aria-label="Remove project" onClick={() => set("projects", p.projects.filter((_, j) => j !== i))} className="grid size-11 shrink-0 place-items-center text-ink-3 hover:text-danger">
                <Trash2 size={20} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <label className="sr-only" htmlFor={`pr-${i}-desc`}>What you built</label>
            <textarea id={`pr-${i}-desc`} rows={3} className="input h-auto py-2 font-serif text-resume" placeholder="What you built and how" value={pr.description} onChange={(e) => set("projects", p.projects.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
          </div>
        ))}
        <Button type="button" variant="text" onClick={() => set("projects", [...p.projects, { name: "", description: "", tech: [] }])}>
          <Plus size={16} strokeWidth={1.5} aria-hidden /> Add project
        </Button>
      </fieldset>

      {error && <p className="text-small text-danger" role="alert">{error}</p>}
      <Button type="submit" loading={pending}>Save profile</Button>
    </form>
  );
}
