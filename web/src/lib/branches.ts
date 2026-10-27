import type { Branch } from "./skills";

/**
 * Engineering branches and the job searches that find fresher jobs for each. One list, so the morning job fetch
 * (scripts/cron.ts) and later the branch picker use the same names. A student's branch comes from their skills
 * (likelyBranch in lib/skills.ts).
 *
 * `searches` always run, so jobs are already waiting when a branch's first students sign up; `more` runs only
 * once the branch has students.
 */
export const BRANCHES: { id: Branch; name: string; searches: string[]; more: string[] }[] = [
  { id: "cs", name: "CS / IT", searches: ["software engineer fresher", "web developer fresher", "data analyst fresher"], more: [] },
  {
    id: "entc",
    name: "ENTC / Electronics",
    searches: ["electronics engineer fresher", "embedded engineer fresher"],
    more: ["vlsi design engineer fresher", "hardware engineer trainee", "telecom engineer fresher"],
  },
  {
    id: "electrical",
    name: "Electrical",
    searches: ["electrical engineer fresher", "graduate engineer trainee electrical"],
    more: ["electrical design engineer trainee", "electrical maintenance engineer fresher"],
  },
  {
    id: "mechanical",
    name: "Mechanical",
    searches: ["mechanical engineer fresher", "graduate engineer trainee mechanical"],
    more: ["design engineer trainee mechanical", "production engineer trainee", "quality engineer fresher", "maintenance engineer trainee"],
  },
  {
    id: "civil",
    name: "Civil",
    searches: ["civil engineer fresher", "site engineer fresher"],
    more: ["quantity surveyor fresher", "structural design engineer fresher", "planning engineer trainee"],
  },
  {
    id: "chemical",
    name: "Chemical",
    searches: ["chemical engineer fresher", "process engineer trainee"],
    more: ["production chemist fresher", "chemical plant trainee"],
  },
  { id: "general", name: "Any graduate", searches: ["internship", "graduate engineer trainee", "fresher jobs"], more: [] },
];

/**
 * The morning fetch's searches: students' own roles, then every branch's, taken in turn ("frontend developer
 * fresher", "software engineer fresher", "electronics engineer fresher", …) so each run's few searches cover
 * several branches instead of one.
 */
export function fetchSearches(studentRoles: string[], studentsPerBranch: Partial<Record<Branch, number>>): string[] {
  const groups = [
    studentRoles.map((r) => `${r.toLowerCase().trim()} fresher`),
    ...BRANCHES.map((b) => (studentsPerBranch[b.id] ? [...b.searches, ...b.more] : b.searches)),
  ];
  const out: string[] = [];
  for (let i = 0; groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (i < g.length && !out.includes(g[i])) out.push(g[i]);
  }
  return out;
}
