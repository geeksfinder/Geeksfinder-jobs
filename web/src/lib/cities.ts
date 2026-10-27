import { city } from "./format";

/**
 * Cities: one spelling per city, common typos, the list students pick from, and regions (Delhi NCR = Delhi, Noida,
 * Gurugram…). Pure, so matching, search, onboarding, scripts and tests all share it. lib/job-facets.ts re-exports
 * canonicalCity and citySpellings for the code that already imports them from there.
 */

/** One spelling per city, so "Bangalore" and "Bengaluru" filter the same jobs. Includes typos students type. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru", bengaluru: "Bengaluru", banglore: "Bengaluru", bengalore: "Bengaluru", bangaluru: "Bengaluru", blr: "Bengaluru",
  gurgaon: "Gurugram", gurugram: "Gurugram", gurgoan: "Gurugram",
  bombay: "Mumbai", mumbai: "Mumbai", mumbia: "Mumbai",
  "new delhi": "Delhi", delhi: "Delhi", dehli: "Delhi", "delhi ncr": "Delhi",
  madras: "Chennai", chennai: "Chennai", chenai: "Chennai",
  calcutta: "Kolkata", kolkata: "Kolkata", kolkatta: "Kolkata",
  poona: "Pune", pune: "Pune",
  hydrabad: "Hyderabad", hyderbad: "Hyderabad", secunderabad: "Hyderabad",
  trivandrum: "Thiruvananthapuram", thiruvananthapuram: "Thiruvananthapuram",
  cochin: "Kochi", kochi: "Kochi",
  baroda: "Vadodara", vadodara: "Vadodara",
  mysore: "Mysuru", mysuru: "Mysuru",
  mangalore: "Mangaluru", mangaluru: "Mangaluru",
  "navi mumbai": "Navi Mumbai", "greater noida": "Greater Noida",
};

export function canonicalCity(name: string | null | undefined) {
  const c = city(name);
  if (!c) return "";
  return CITY_ALIASES[c.toLowerCase()] ?? c.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Every spelling we store for a canonical city (used to build the database filter). */
export function citySpellings(canonical: string) {
  const all = Object.entries(CITY_ALIASES).filter(([, v]) => v.toLowerCase() === canonical.toLowerCase()).map(([k]) => k);
  return all.length ? all : [canonical.toLowerCase()];
}

export const ANYWHERE = "Anywhere in India";
export const REMOTE = "Remote";

/** Cities students pick from (metros first, then tier-2 hubs with engineering and fresher hiring). */
export const INDIA_CITIES = [
  REMOTE, ANYWHERE,
  "Bengaluru", "Pune", "Hyderabad", "Mumbai", "Chennai", "Delhi NCR", "Kolkata", "Ahmedabad",
  "Noida", "Gurugram", "Navi Mumbai", "Thane", "Nagpur", "Nashik", "Aurangabad", "Kolhapur", "Indore", "Bhopal",
  "Jaipur", "Lucknow", "Chandigarh", "Mohali", "Coimbatore", "Madurai", "Tiruchirappalli", "Kochi", "Thiruvananthapuram",
  "Mysuru", "Mangaluru", "Hubballi", "Visakhapatnam", "Vijayawada", "Vadodara", "Surat", "Rajkot", "Bhubaneswar",
  "Guwahati", "Patna", "Ranchi", "Jamshedpur", "Dehradun", "Goa",
];

// Industrial towns where core-engineering jobs are posted, beyond the cities students pick from
const INDUSTRIAL_TOWNS = ["Hosur", "Chakan", "Sanand", "Manesar", "Sriperumbudur", "Ghaziabad", "Faridabad", "Bhiwadi", "Pithampur", "Hinjewadi", "Jamnagar", "Bharuch", "Ankleshwar", "Dahej"];
const INDIA_WORDS = ["india", ...INDIA_CITIES.filter((c) => c !== REMOTE && c !== ANYWHERE), ...Object.keys(CITY_ALIASES), ...INDUSTRIAL_TOWNS];
// Whole words only, so "Indiana" and "Indianapolis" aren't India
const INDIA_RE = new RegExp(`(^|[^a-z])(${INDIA_WORDS.map((w) => w.toLowerCase()).join("|")})([^a-z]|$)`, "i");

/** A job location in India: it names the country or an Indian city or industrial town. */
export const inIndia = (location: string | null | undefined) => INDIA_RE.test(location ?? "");

/** A city as a student typed it, under the spelling we use ("banglore" → "Bengaluru", "remote" → "Remote"). */
export function tidyCity(typed: string) {
  const picked = INDIA_CITIES.find((c) => c.toLowerCase() === typed.trim().toLowerCase());
  return picked ?? (canonicalCity(typed) || typed);
}

/** A wanted place that covers several job locations. */
const REGIONS: Record<string, string[]> = {
  "Delhi NCR": ["Delhi", "Noida", "Greater Noida", "Gurugram", "Ghaziabad", "Faridabad"],
  Mumbai: ["Mumbai", "Navi Mumbai", "Thane"],
  Pune: ["Pune", "Pimpri", "Chinchwad", "Hinjewadi"],
  Hyderabad: ["Hyderabad"],
  Chandigarh: ["Chandigarh", "Mohali", "Panchkula"],
};

/**
 * How well a job's place fits what a student wants: 1 = a city they picked (or "Anywhere in India" for an Indian
 * job, or Remote for a remote job); 0.5 = a remote job they didn't ask for; 0 = elsewhere.
 */
export function placeFit(wanted: string[], jobLocation: string | null, jobRemote: boolean | null): number {
  const is = (w: string, label: string) => w.trim().toLowerCase() === label.toLowerCase();
  if (jobRemote && wanted.some((w) => is(w, REMOTE) || is(w, ANYWHERE))) return 1;
  const loc = (jobLocation ?? "").toLowerCase();
  const jobCity = canonicalCity(jobLocation);
  if (!jobRemote && jobCity && wanted.some((w) => is(w, ANYWHERE))) return 1;
  for (const w of wanted) {
    if (is(w, REMOTE) || is(w, ANYWHERE) || !w.trim()) continue;
    // A region by the name the student picked ("Delhi NCR"), otherwise the city under its one spelling
    const region = Object.keys(REGIONS).find((k) => is(w, k));
    const places = region ? REGIONS[region] : [canonicalCity(w)];
    if (places.some((p) => jobCity === canonicalCity(p) || loc.includes(p.toLowerCase()))) return 1;
  }
  return jobRemote ? 0.5 : 0;
}
