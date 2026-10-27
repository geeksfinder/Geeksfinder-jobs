import { canonicalSkill, likelyBranch, skillKey, type Branch } from "./skills";

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

/**
 * Roles students pick from, by branch. `signals` are dictionary skills (lib/skills.ts) that point to the role, so a
 * resume with SolidWorks and GD&T suggests Design Engineer first. Onboarding and the profile offer these in the tag
 * input; anything else can still be typed.
 */
type Role = { name: string; branch: Branch; signals: string[] };
const R = (branch: Branch, list: [string, string[]][]): Role[] => list.map(([name, signals]) => ({ name, branch, signals }));

export const ROLES: Role[] = [
  ...R("cs", [
    ["Software Engineer", ["Java", "Python", "C++", "Data Structures", "Algorithms", "OOP"]],
    ["Frontend Developer", ["React", "JavaScript", "TypeScript", "HTML", "CSS", "Angular", "Vue", "Next.js", "Tailwind CSS", "Redux"]],
    ["Backend Developer", ["Node.js", "Express", "Java", "Spring Boot", "Django", "FastAPI", "SQL", "REST APIs", "Microservices"]],
    ["Full Stack Developer", ["React", "Node.js", "Express", "MongoDB", "Next.js", "JavaScript"]],
    ["Web Developer", ["HTML", "CSS", "JavaScript", "PHP", "Bootstrap", "Laravel"]],
    ["Java Developer", ["Java", "Spring Boot", "OOP"]],
    ["Python Developer", ["Python", "Django", "Flask", "FastAPI"]],
    [".NET Developer", ["C#", ".NET"]],
    ["Android Developer", ["Android", "Kotlin", "Java"]],
    ["iOS Developer", ["Swift"]],
    ["Flutter Developer", ["Flutter", "Firebase"]],
    ["React Native Developer", ["React Native", "JavaScript"]],
    ["Data Analyst", ["SQL", "Excel", "Power BI", "Tableau", "Python", "Pandas"]],
    ["Business Analyst", ["Excel", "SQL", "Power BI", "Jira", "Agile"]],
    ["Data Scientist", ["Python", "Machine Learning", "Pandas", "NumPy", "scikit-learn"]],
    ["Machine Learning Engineer", ["Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "NLP"]],
    ["AI Engineer", ["Generative AI", "NLP", "Deep Learning", "Python"]],
    ["Data Engineer", ["SQL", "Python", "AWS", "GCP", "Azure"]],
    ["DevOps Engineer", ["Docker", "Kubernetes", "CI/CD", "Jenkins", "Terraform", "Linux", "AWS"]],
    ["Cloud Engineer", ["AWS", "Azure", "GCP", "Linux", "Terraform"]],
    ["QA Engineer", ["Manual Testing", "Selenium", "Jest", "Jira"]],
    ["Automation Test Engineer", ["Selenium", "Java", "Python"]],
    ["Cyber Security Analyst", ["Cyber Security", "Linux", "Computer Networks"]],
    ["System Administrator", ["Linux", "Operating Systems", "Computer Networks"]],
    ["Technical Support Engineer", ["Linux", "Computer Networks", "Operating Systems"]],
    ["UI/UX Designer", ["Figma"]],
    ["Database Administrator", ["SQL", "MySQL", "PostgreSQL", "Oracle", "DBMS"]],
    ["Go Developer", ["Go"]],
  ]),
  ...R("entc", [
    ["Electronics Engineer", ["Digital Electronics", "Analog Electronics", "Microcontrollers"]],
    ["Embedded Engineer", ["Embedded C", "Embedded Systems", "Microcontrollers", "ARM", "RTOS"]],
    ["Embedded Software Engineer", ["Embedded C", "C", "C++", "RTOS", "Linux"]],
    ["Firmware Engineer", ["Embedded C", "ARM", "Microcontrollers", "RTOS"]],
    ["VLSI Design Engineer", ["VLSI", "Verilog", "VHDL", "Digital Electronics", "Cadence"]],
    ["Design Verification Engineer", ["Verilog", "VLSI", "Digital Electronics"]],
    ["Physical Design Engineer", ["VLSI", "Cadence"]],
    ["FPGA Engineer", ["FPGA", "Verilog", "VHDL"]],
    ["Analog Design Engineer", ["Analog Electronics", "Cadence"]],
    ["PCB Design Engineer", ["PCB Design", "Analog Electronics", "Digital Electronics"]],
    ["Hardware Engineer", ["PCB Design", "Digital Electronics", "Analog Electronics", "Microcontrollers"]],
    ["IoT Engineer", ["IoT", "Arduino", "Raspberry Pi", "Embedded C"]],
    ["Telecom Engineer", ["Telecom", "Computer Networks", "Signal Processing"]],
    ["RF Engineer", ["Telecom", "Signal Processing"]],
    ["Signal Processing Engineer", ["Signal Processing", "MATLAB"]],
    ["Robotics Engineer", ["Embedded Systems", "Arduino", "Python", "MATLAB"]],
    ["Instrumentation Engineer", ["PLC", "SCADA", "Analog Electronics"]],
    ["Electronics Test Engineer", ["Digital Electronics", "Analog Electronics"]],
    ["Field Service Engineer", ["Digital Electronics", "Telecom", "Maintenance"]],
  ]),
  ...R("electrical", [
    ["Electrical Engineer", ["Electrical Machines", "Power Systems", "Switchgear"]],
    ["Electrical Design Engineer", ["Electrical Design", "AutoCAD", "ETAP"]],
    ["Electrical Maintenance Engineer", ["Maintenance", "Electrical Machines", "Switchgear", "PLC"]],
    ["Power Systems Engineer", ["Power Systems", "ETAP", "MATLAB"]],
    ["Substation Engineer", ["Switchgear", "Power Systems"]],
    ["Protection Engineer", ["Power Systems", "Switchgear", "ETAP"]],
    ["Solar Design Engineer", ["Solar PV", "AutoCAD", "Electrical Design"]],
    ["EV Engineer", ["Power Electronics", "MATLAB", "Electrical Machines"]],
    ["Power Electronics Engineer", ["Power Electronics", "MATLAB"]],
    ["Automation Engineer", ["PLC", "SCADA"]],
    ["Control Systems Engineer", ["PLC", "SCADA", "MATLAB"]],
    ["Electrical Site Engineer", ["Site Execution", "Switchgear", "Electrical Design"]],
    ["Electrical Testing Engineer", ["Electrical Machines", "Switchgear"]],
  ]),
  ...R("mechanical", [
    ["Mechanical Engineer", ["Thermodynamics", "Manufacturing", "AutoCAD"]],
    ["Design Engineer", ["SolidWorks", "CATIA", "Creo", "NX", "AutoCAD", "GD&T", "Fusion 360"]],
    ["CAD Engineer", ["AutoCAD", "SolidWorks", "CATIA", "Creo", "NX"]],
    ["CAE Engineer", ["ANSYS", "FEA", "CFD"]],
    ["Thermal Engineer", ["CFD", "ANSYS", "Thermodynamics", "HVAC"]],
    ["Production Engineer", ["Manufacturing", "Lean Manufacturing", "CNC"]],
    ["Manufacturing Engineer", ["Manufacturing", "Lean Manufacturing", "Six Sigma", "CNC"]],
    ["Quality Engineer", ["Quality Control", "Six Sigma", "GD&T"]],
    ["Maintenance Engineer", ["Maintenance", "Manufacturing"]],
    ["Automobile Engineer", ["Automobile", "CATIA", "Manufacturing"]],
    ["HVAC Engineer", ["HVAC", "AutoCAD", "Thermodynamics"]],
    ["Piping Engineer", ["AutoCAD"]],
    ["Tool Design Engineer", ["NX", "Creo", "GD&T", "CNC"]],
    ["CNC Programmer", ["CNC"]],
    ["Industrial Engineer", ["Lean Manufacturing", "Six Sigma"]],
    ["R&D Engineer", ["SolidWorks", "ANSYS", "MATLAB"]],
    ["Service Engineer", ["Maintenance", "Automobile"]],
    ["Sales Engineer", ["Communication", "AutoCAD"]],
    ["Supply Chain Executive", ["Excel", "Manufacturing"]],
  ]),
  ...R("civil", [
    ["Civil Engineer", ["AutoCAD", "Construction Management", "Site Execution"]],
    ["Site Engineer", ["Site Execution", "AutoCAD", "Construction Management"]],
    ["Structural Engineer", ["STAAD Pro", "ETABS", "Structural Design"]],
    ["Structural Design Engineer", ["STAAD Pro", "ETABS", "Structural Design", "AutoCAD"]],
    ["Quantity Surveyor", ["Quantity Surveying", "Excel", "AutoCAD"]],
    ["Billing Engineer", ["Quantity Surveying", "Excel"]],
    ["Planning Engineer", ["Primavera", "MS Project", "Construction Management"]],
    ["Project Engineer", ["Construction Management", "MS Project", "Site Execution"]],
    ["BIM Modeller", ["BIM", "Revit"]],
    ["Draughtsman", ["AutoCAD", "Revit"]],
    ["Surveyor", ["Surveying", "AutoCAD"]],
    ["Highway Engineer", ["AutoCAD", "Surveying"]],
    ["Geotechnical Engineer", ["Structural Design"]],
    ["Environmental Engineer", []],
    ["Safety Officer", ["Construction Management"]],
  ]),
  ...R("chemical", [
    ["Chemical Engineer", ["Process Engineering", "Aspen Plus"]],
    ["Process Engineer", ["Process Engineering", "Aspen Plus", "Chemical Process Safety"]],
    ["Process Safety Engineer", ["Chemical Process Safety"]],
    ["Production Chemist", ["Quality Control", "Process Engineering"]],
    ["Quality Control Chemist", ["Quality Control"]],
    ["R&D Chemist", ["Process Engineering"]],
    ["Plant Engineer", ["Process Engineering", "Maintenance"]],
    ["Polymer Engineer", ["Process Engineering"]],
    ["Petroleum Engineer", ["Process Engineering", "Aspen Plus"]],
  ]),
  ...R("general", [
    ["Graduate Engineer Trainee", []],
    ["Management Trainee", []],
    ["Business Development Executive", []],
    ["Sales Executive", []],
    ["Customer Support Executive", []],
    ["Operations Executive", []],
    ["HR Executive", []],
    ["Digital Marketing Executive", []],
    ["Content Writer", []],
    ["Technical Writer", []],
    ["Product Analyst", ["SQL", "Excel"]],
    ["Associate Consultant", []],
  ]),
];

export const ROLE_NAMES = ROLES.map((r) => r.name);

/**
 * Every role, best first for this student: roles their skills point to (more matching skills first, their branch
 * breaking ties), then the rest of their branch, then everything else. The tag input shows the top 8 until they type.
 */
export function suggestRoles(skills: string[], chosen?: Branch | null): string[] {
  const mine = new Set(skills.map((s) => skillKey(canonicalSkill(s))));
  // The branch the student picked, else the one their skills point to
  const branch = chosen ?? likelyBranch(skills);
  const fit = (r: Role) => r.signals.filter((s) => mine.has(skillKey(s))).length * 2 + (r.branch === branch ? 1 : 0);
  return ROLES.map((r, i) => ({ r, i, fit: fit(r) }))
    .sort((a, b) => b.fit - a.fit || a.i - b.i)
    .map(({ r }) => r.name);
}
