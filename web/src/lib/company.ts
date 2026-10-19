/** Company display names and logo domains. Job boards often send legal or board names ("Rubrik Job Board"). */

const SUFFIXES = /\s*(?:,?\s*(?:job board|careers|jobs|software private limited|private limited|pvt\.? ltd\.?|ltd\.?|llc|inc\.?|corp\.?|technologies private limited))+\s*$/i;

export function cleanCompany(name: string) {
  const cleaned = name.trim().replace(SUFFIXES, "").trim();
  return cleaned || name.trim();
}

// Companies whose job board doesn't link to their own site
const KNOWN: Record<string, string> = {
  zscaler: "zscaler.com",
  meesho: "meesho.com",
  gitlab: "gitlab.com",
  hackerrank: "hackerrank.com",
  razorpay: "razorpay.com",
  zeta: "zeta.tech",
  twilio: "twilio.com",
  groww: "groww.in",
  cred: "cred.club",
  "sumo logic": "sumologic.com",
  cloudflare: "cloudflare.com",
  rubrik: "rubrik.com",
  toast: "toasttab.com",
  databricks: "databricks.com",
  okta: "okta.com",
  mongodb: "mongodb.com",
  stripe: "stripe.com",
  elastic: "elastic.co",
  coinbase: "coinbase.com",
  druva: "druva.com",
  airbnb: "airbnb.com",
  samsara: "samsara.com",
  postman: "postman.com",
  swiggy: "swiggy.com",
  zomato: "zomato.com",
  flipkart: "flipkart.com",
  phonepe: "phonepe.com",
  freshworks: "freshworks.com",
  zepto: "zeptonow.com",
  browserstack: "browserstack.com",
  // Companies from the Lever, Ashby and SmartRecruiters feeds (their feeds don't include a website)
  "bosch group": "bosch.com",
  agoda: "agoda.com",
  inmobi: "inmobi.com",
  sigmoid: "sigmoid.com",
  glance: "glance.com",
  paytm: "paytm.com",
  mindtickle: "mindtickle.com",
  tekion: "tekion.com",
  "100ms": "100ms.live",
  snowflake: "snowflake.com",
  sarvam: "sarvam.ai",
  bureau: "bureau.id",
  "new relic": "newrelic.com",
  servicenow: "servicenow.com",
  experian: "experian.com",
  ubisoft: "ubisoft.com",
  grab: "grab.com",
  atlan: "atlan.com",
};

const DOMAIN = /^(?=.{4,80}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

// Applicant-tracking systems, job boards, social networks and site builders: a job often carries one of these as
// the employer's "website", but it's never the company's own domain (wrong logo, wrong HR contacts, wrong page)
const NOT_A_COMPANY =
  /(^|\.)(greenhouse\.io|lever\.co|myworkdayjobs\.com|workday\.com|ashbyhq\.com|smartrecruiters\.com|linkedin\.com|naukri\.com|indeed\.(com|co\.in)|glassdoor\.(com|co\.in)|foundit\.in|monsterindia\.com|shine\.com|timesjobs\.com|internshala\.com|apna\.co|workindia\.in|wellfound\.com|angel\.co|instahyre\.com|cutshort\.io|hirist\.(com|tech)|iimjobs\.com|freshersworld\.com|justdial\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|google\.com|sites\.google\.com|blogspot\.com|wordpress\.com|wixsite\.com|wix\.com|godaddysites\.com|business\.site|jobs\.lever\.co|zohorecruit\.(com|in)|keka\.com|darwinbox\.in|freshteam\.com|recruitee\.com|teamtailor\.com|bamboohr\.com|breezy\.hr|jobvite\.com|icims\.com|taleo\.net|successfactors\.(com|eu)|oraclecloud\.com)$/;

/** Best domain for a company's logo, or null. Strips careers./jobs. subdomains from job-board links. */
export function logoDomain(company: string, domain?: string | null): string | null {
  const d = (domain ?? "").toLowerCase().replace(/^(?:www|careers|jobs|boards|apply|job-boards)\./, "");
  if (DOMAIN.test(d) && !NOT_A_COMPANY.test(d)) return d;
  return KNOWN[cleanCompany(company).toLowerCase()] ?? null;
}

export const isLogoDomain = (d: string) => DOMAIN.test(d);
export const isCompanyDomain = (d: string) => DOMAIN.test(d) && !NOT_A_COMPANY.test(d);
