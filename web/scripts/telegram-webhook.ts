/**
 * Point the Telegram bot at this site's webhook: `npm run telegram:webhook` after changing domains.
 * Uses NEXT_PUBLIC_APP_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET from .env.local; prints no secrets.
 */
async function main() {
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!/^https:\/\//.test(site) || !token || !secret) {
    console.error("Set NEXT_PUBLIC_APP_URL (https://…), TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .env.local first.");
    process.exit(1);
  }
  const url = `${site}/api/telegram/webhook`;
  const set = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret }),
  }).then((r) => r.json());
  console.log(set.ok ? `Webhook set: ${url}` : `Telegram refused: ${set.description}`);
  const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
  console.log(`Now pointing at: ${info.result?.url || "(none)"}${info.result?.last_error_message ? ` · last error: ${info.result.last_error_message}` : ""}`);
}
main();
