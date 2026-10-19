import type { DiffLine } from "@/components/ui/ResumeDiff";

/** Real-looking sample data used on the landing page and /styleguide (DESIGN.md: no lorem ipsum). */
export const SAMPLE_DIFF: DiffLine[] = [
  {
    id: "sum",
    section: "Summary",
    before: "Final-year CSE student interested in web development and learning new technologies.",
    after: "Final-year CSE student who builds React front-ends and connects them to REST APIs.",
  },
  {
    id: "sk",
    section: "Skills",
    before: "Python, SQL, React, HTML, CSS, Git, REST APIs",
    after: "React, REST APIs, Git, HTML, CSS, Python, SQL",
  },
  {
    id: "p1",
    section: "Projects",
    before: "Campus Canteen App — made a website for ordering food in college using React and Firebase.",
    after: "Campus Canteen App — built a React ordering site with Firebase auth, used by students in the college canteen.",
  },
  {
    id: "p2",
    section: "Projects",
    before: "Expense Tracker — Python Flask app with SQL database to track expenses.",
    after: "Expense Tracker — Python Flask app with a SQL database to track expenses.",
  },
  {
    id: "ed",
    section: "Education",
    before: "B.Tech Computer Science, Kolhapur — 2026 · CGPA 8.1",
    after: "B.Tech Computer Science, Kolhapur — 2026 · CGPA 8.1",
  },
];

export const FAQ = [
  {
    q: "Is it really ₹10?",
    a: "Yes. Hustle is ₹10 every 15 days, or ₹20 a month if you prefer one debit a month. Same features either way. Fresher, the free plan, stays free with weekly alerts and one tailored resume.",
  },
  {
    q: "How does autopay work?",
    a: "You approve a UPI Autopay mandate once in your UPI app. Your 7-day free trial starts that day and the first ₹10 is debited on day 8. Your bank notifies you 24 hours before every debit.",
  },
  {
    q: "How do I cancel?",
    a: "Open your UPI app (GPay, PhonePe, Paytm), go to Autopay or Mandates, and cancel GeeksFinder. You can also cancel from the Billing page. Your plan stays active until the end of the period you paid for.",
  },
  {
    q: "Where do jobs come from?",
    a: "Licensed job aggregators (which include LinkedIn-sourced listings), company career pages on Greenhouse and Lever, and job boards like Adzuna. We never scrape LinkedIn.",
  },
  {
    q: "Is my resume data safe?",
    a: "Your resume is stored in a private bucket that only you can open. We never sell your data, and you can delete your account and everything in it from Settings.",
  },
  {
    q: "Do you apply for me?",
    a: "No. The Apply button opens the original listing and you apply yourself. We help you send a better resume and a personal email to HR.",
  },
];
