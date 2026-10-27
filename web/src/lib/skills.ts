/**
 * One skill dictionary for every branch: each skill's display name, the other ways people write it, and its branch.
 * Matching (lib/matching.ts), the ATS checker (lib/ats.ts) and search use it, so "ReactJS" on a resume meets "React"
 * in a job, and a mechanical student's "SolidWorks" is recognised like a developer's "Python". Pure data + helpers:
 * safe for client components, scripts and tests. Add a skill here and every feature learns it.
 */
/** Branch ids; names and searches live in lib/branches.ts. Same list as the profiles.branch check (migration 017). */
export const BRANCH_IDS = ["cs", "entc", "electrical", "mechanical", "civil", "chemical", "general"] as const;
export type Branch = (typeof BRANCH_IDS)[number];
type Skill = { name: string; aliases?: string[]; branch: Branch };

export const SKILL_LIST: Skill[] = [
  // Software, data and IT
  { name: "JavaScript", aliases: ["js", "ecmascript", "es6"], branch: "cs" },
  { name: "TypeScript", aliases: ["ts"], branch: "cs" },
  { name: "React", aliases: ["reactjs", "react.js"], branch: "cs" },
  { name: "Next.js", aliases: ["nextjs", "next js"], branch: "cs" },
  { name: "Angular", aliases: ["angularjs", "angular.js"], branch: "cs" },
  { name: "Vue", aliases: ["vuejs", "vue.js"], branch: "cs" },
  { name: "Node.js", aliases: ["nodejs", "node js", "node"], branch: "cs" },
  { name: "Express", aliases: ["expressjs", "express.js"], branch: "cs" },
  { name: "HTML", aliases: ["html5"], branch: "cs" },
  { name: "CSS", aliases: ["css3"], branch: "cs" },
  { name: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"], branch: "cs" },
  { name: "Bootstrap", branch: "cs" },
  { name: "Redux", branch: "cs" },
  { name: "Python", aliases: ["python3"], branch: "cs" },
  { name: "Django", branch: "cs" },
  { name: "Flask", branch: "cs" },
  { name: "FastAPI", aliases: ["fast api"], branch: "cs" },
  { name: "Java", aliases: ["core java", "java se"], branch: "cs" },
  { name: "Spring Boot", aliases: ["springboot", "spring"], branch: "cs" },
  { name: "Kotlin", branch: "cs" },
  { name: "C", aliases: ["c programming", "c language"], branch: "cs" },
  { name: "C++", aliases: ["cpp", "c plus plus"], branch: "cs" },
  { name: "C#", aliases: ["c sharp", "csharp"], branch: "cs" },
  { name: ".NET", aliases: ["dotnet", "asp.net", ".net core"], branch: "cs" },
  { name: "Go", aliases: ["golang"], branch: "cs" },
  { name: "Rust", branch: "cs" },
  { name: "PHP", branch: "cs" },
  { name: "Laravel", branch: "cs" },
  { name: "Ruby", aliases: ["ruby on rails", "rails"], branch: "cs" },
  { name: "SQL", aliases: ["structured query language"], branch: "cs" },
  { name: "MySQL", branch: "cs" },
  { name: "PostgreSQL", aliases: ["postgres", "postgre sql"], branch: "cs" },
  { name: "MongoDB", aliases: ["mongo", "mongo db"], branch: "cs" },
  { name: "Redis", branch: "cs" },
  { name: "Firebase", branch: "cs" },
  { name: "Supabase", branch: "cs" },
  { name: "Oracle", aliases: ["oracle db", "pl/sql", "plsql"], branch: "cs" },
  { name: "GraphQL", branch: "cs" },
  { name: "REST APIs", aliases: ["rest api", "restful api", "restful apis", "rest", "apis"], branch: "cs" },
  { name: "Microservices", branch: "cs" },
  { name: "Git", aliases: ["version control"], branch: "cs" },
  { name: "GitHub", branch: "cs" },
  { name: "Docker", branch: "cs" },
  { name: "Kubernetes", aliases: ["k8s"], branch: "cs" },
  { name: "AWS", aliases: ["amazon web services"], branch: "cs" },
  { name: "Azure", aliases: ["microsoft azure"], branch: "cs" },
  { name: "GCP", aliases: ["google cloud", "google cloud platform"], branch: "cs" },
  { name: "Linux", aliases: ["unix"], branch: "cs" },
  { name: "CI/CD", aliases: ["cicd", "ci cd"], branch: "cs" },
  { name: "Jenkins", branch: "cs" },
  { name: "Terraform", branch: "cs" },
  { name: "Machine Learning", aliases: ["ml"], branch: "cs" },
  { name: "Deep Learning", aliases: ["dl"], branch: "cs" },
  { name: "NLP", aliases: ["natural language processing"], branch: "cs" },
  { name: "Generative AI", aliases: ["genai", "gen ai", "llm", "llms"], branch: "cs" },
  { name: "TensorFlow", branch: "cs" },
  { name: "PyTorch", branch: "cs" },
  { name: "Pandas", branch: "cs" },
  { name: "NumPy", branch: "cs" },
  { name: "scikit-learn", aliases: ["sklearn", "scikit learn"], branch: "cs" },
  { name: "Power BI", aliases: ["powerbi"], branch: "cs" },
  { name: "Tableau", branch: "cs" },
  { name: "Data Structures", aliases: ["dsa", "data structures and algorithms"], branch: "cs" },
  { name: "Algorithms", branch: "cs" },
  { name: "OOP", aliases: ["oops", "object oriented programming"], branch: "cs" },
  { name: "DBMS", aliases: ["database management"], branch: "cs" },
  { name: "Operating Systems", aliases: ["os"], branch: "cs" },
  { name: "Computer Networks", aliases: ["networking", "cn"], branch: "cs" },
  { name: "System Design", branch: "cs" },
  { name: "Android", aliases: ["android development"], branch: "cs" },
  { name: "Flutter", branch: "cs" },
  { name: "React Native", branch: "cs" },
  { name: "Swift", aliases: ["ios"], branch: "cs" },
  { name: "Figma", branch: "cs" },
  { name: "Selenium", branch: "cs" },
  { name: "Jest", branch: "cs" },
  { name: "Manual Testing", aliases: ["software testing", "testing"], branch: "cs" },
  { name: "Cyber Security", aliases: ["cybersecurity", "information security"], branch: "cs" },
  // Electronics and telecommunication (ENTC)
  { name: "Embedded C", aliases: ["embedded c programming"], branch: "entc" },
  { name: "Embedded Systems", aliases: ["embedded"], branch: "entc" },
  { name: "Microcontrollers", aliases: ["microcontroller", "8051", "avr"], branch: "entc" },
  { name: "Arduino", branch: "entc" },
  { name: "Raspberry Pi", branch: "entc" },
  { name: "ARM", aliases: ["arm cortex", "stm32"], branch: "entc" },
  { name: "RTOS", aliases: ["freertos", "real time operating system"], branch: "entc" },
  { name: "VLSI", aliases: ["vlsi design"], branch: "entc" },
  { name: "Verilog", aliases: ["verilog hdl", "systemverilog", "system verilog"], branch: "entc" },
  { name: "VHDL", branch: "entc" },
  { name: "FPGA", branch: "entc" },
  { name: "PCB Design", aliases: ["pcb", "pcb layout", "altium", "kicad", "eagle"], branch: "entc" },
  { name: "Digital Electronics", branch: "entc" },
  { name: "Analog Electronics", aliases: ["analog circuits"], branch: "entc" },
  { name: "Signal Processing", aliases: ["dsp", "digital signal processing"], branch: "entc" },
  { name: "IoT", aliases: ["internet of things"], branch: "entc" },
  { name: "Telecom", aliases: ["telecommunication", "rf", "5g", "lte"], branch: "entc" },
  { name: "Cadence", aliases: ["cadence virtuoso"], branch: "entc" },
  // Electrical
  { name: "PLC", aliases: ["plc programming", "ladder logic"], branch: "electrical" },
  { name: "SCADA", branch: "electrical" },
  { name: "Power Systems", aliases: ["power system"], branch: "electrical" },
  { name: "Electrical Machines", aliases: ["motors", "transformers"], branch: "electrical" },
  { name: "Switchgear", branch: "electrical" },
  { name: "Electrical Design", aliases: ["electrical drawing", "single line diagram", "sld"], branch: "electrical" },
  { name: "ETAP", branch: "electrical" },
  { name: "Power Electronics", branch: "electrical" },
  { name: "Solar PV", aliases: ["solar", "renewable energy"], branch: "electrical" },
  { name: "MATLAB", aliases: ["simulink", "matlab simulink"], branch: "electrical" },
  // Mechanical
  { name: "AutoCAD", aliases: ["auto cad", "autocad 2d", "autocad 3d"], branch: "mechanical" },
  { name: "SolidWorks", aliases: ["solid works"], branch: "mechanical" },
  { name: "CATIA", aliases: ["catia v5"], branch: "mechanical" },
  { name: "Creo", aliases: ["pro/e", "pro engineer", "ptc creo"], branch: "mechanical" },
  { name: "NX", aliases: ["siemens nx", "unigraphics"], branch: "mechanical" },
  { name: "Fusion 360", branch: "mechanical" },
  { name: "ANSYS", aliases: ["ansys workbench"], branch: "mechanical" },
  { name: "FEA", aliases: ["finite element analysis"], branch: "mechanical" },
  { name: "CFD", aliases: ["computational fluid dynamics"], branch: "mechanical" },
  { name: "GD&T", aliases: ["gdt", "geometric dimensioning and tolerancing"], branch: "mechanical" },
  { name: "CNC", aliases: ["cnc programming", "vmc"], branch: "mechanical" },
  { name: "Manufacturing", aliases: ["production", "manufacturing processes"], branch: "mechanical" },
  { name: "Lean Manufacturing", aliases: ["lean", "kaizen", "5s"], branch: "mechanical" },
  { name: "Six Sigma", branch: "mechanical" },
  { name: "Quality Control", aliases: ["qc", "quality assurance", "qa/qc"], branch: "mechanical" },
  { name: "HVAC", branch: "mechanical" },
  { name: "Thermodynamics", branch: "mechanical" },
  { name: "Automobile", aliases: ["automotive"], branch: "mechanical" },
  { name: "Maintenance", aliases: ["preventive maintenance", "plant maintenance"], branch: "mechanical" },
  // Civil
  { name: "STAAD Pro", aliases: ["staad", "staad.pro"], branch: "civil" },
  { name: "ETABS", branch: "civil" },
  { name: "Revit", aliases: ["revit architecture", "revit structure"], branch: "civil" },
  { name: "Primavera", aliases: ["primavera p6", "p6"], branch: "civil" },
  { name: "MS Project", aliases: ["microsoft project"], branch: "civil" },
  { name: "Quantity Surveying", aliases: ["boq", "estimation", "billing"], branch: "civil" },
  { name: "Site Execution", aliases: ["site supervision", "site engineer"], branch: "civil" },
  { name: "Surveying", aliases: ["total station", "land surveying"], branch: "civil" },
  { name: "Structural Design", aliases: ["structural analysis", "rcc design"], branch: "civil" },
  { name: "BIM", aliases: ["building information modeling"], branch: "civil" },
  { name: "Construction Management", branch: "civil" },
  // Chemical
  { name: "Aspen Plus", aliases: ["aspen", "aspen hysys", "hysys"], branch: "chemical" },
  { name: "Process Engineering", aliases: ["process design"], branch: "chemical" },
  { name: "Chemical Process Safety", aliases: ["hazop", "process safety"], branch: "chemical" },
  // Everyone
  { name: "Excel", aliases: ["ms excel", "microsoft excel", "advanced excel"], branch: "general" },
  { name: "MS Office", aliases: ["microsoft office"], branch: "general" },
  { name: "Communication", aliases: ["communication skills"], branch: "general" },
  { name: "Problem Solving", branch: "general" },
  { name: "Teamwork", aliases: ["team work"], branch: "general" },
  { name: "Agile", aliases: ["scrum"], branch: "general" },
  { name: "Jira", branch: "general" },
];

/** "React.js" → "reactjs": lower case, only letters, digits and the symbols that tell skills apart (+ # /). */
export const skillKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#/]/g, "");

const BY_KEY = new Map<string, Skill>();
for (const s of SKILL_LIST) for (const spelling of [s.name, ...(s.aliases ?? [])]) if (!BY_KEY.has(skillKey(spelling))) BY_KEY.set(skillKey(spelling), s);

/** The dictionary's name for a skill ("reactjs" → "React"), or the input tidied up if it's not in the dictionary. */
export function canonicalSkill(raw: string): string {
  return BY_KEY.get(skillKey(raw))?.name ?? raw.trim();
}

export const skillBranch = (raw: string): Branch | null => BY_KEY.get(skillKey(raw))?.branch ?? null;

// Aliases that are also ordinary words or too short to trust in free text ("the rest of the team", "node", "os")
const TEXT_UNSAFE = new Set(["rest", "apis", "node", "spring", "lean", "production", "testing", "billing", "estimation", "solar", "embedded", "motors", "ios", "ml", "dl", "os", "cn", "rf", "qc", "p6", "ts", "lte", "avr", "gdt", "vmc", "sld", "dsp", "5s", "rails", "aspen", "networking"]);

/**
 * Every way a skill is written. `inText`: only spellings safe to search for in a resume or job description
 * (ATS checker); comparing two skill lists can use them all.
 */
export const skillSpellings = (name: string, { inText = false } = {}): string[] => {
  const s = BY_KEY.get(skillKey(name));
  const all = s ? [s.name, ...(s.aliases ?? [])] : [name];
  return inText ? all.filter((a, i) => i === 0 || !TEXT_UNSAFE.has(a.toLowerCase())) : all;
};

/** The student's likely branch from their skills: the branch most of their dictionary skills belong to. */
export function likelyBranch(skills: string[]): Branch | null {
  const tally = new Map<Branch, number>();
  for (const s of skills) {
    const b = skillBranch(s);
    if (b && b !== "general") tally.set(b, (tally.get(b) ?? 0) + 1);
  }
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
