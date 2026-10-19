export const SITE = {
  name: "GeeksFinder",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  description:
    "Fresher jobs matched to your skills, on Telegram every morning. Tailor your resume and email HR in one click. Free to start; paid plans from ₹10 per 15 days.",
  bot: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "GeeksFinderBot",
  channel: process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL || "GeeksFinderJobs",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@geeksfinder.in",
};
