import { BRANCHES } from "@/lib/branches";
import type { Branch } from "@/lib/skills";

/** The student's branch, pre-filled from their skills (likelyBranch). Label, hint and field laid out like TagInput. */
export function BranchSelect({ id, value, onChange }: { id: string; value: Branch | null; onChange: (b: Branch | null) => void }) {
  return (
    <div>
      <label htmlFor={id} className="label">Branch</label>
      <p id={`${id}-hint`} className="-mt-1 mb-2 text-small text-ink-2">Filled in from your skills. It decides which job searches run for you.</p>
      <select id={id} className="input" value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as Branch | null)} aria-describedby={`${id}-hint`}>
        <option value="">Choose your branch</option>
        {BRANCHES.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}
