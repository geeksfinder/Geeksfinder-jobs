/**
 * Whether the WhatsApp add-on can be bought. Off until the owner sets WHATSAPP_PLAN_LIVE=1, which they do after
 * Meta approves the templates and the morning WhatsApp digest ships (SPEC.md PR 5), so nobody pays for WhatsApp
 * alerts that wouldn't arrive. Checked again on the server at checkout.
 */
export function whatsappOnSale(): boolean {
  return process.env.WHATSAPP_PLAN_LIVE === "1" && !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}
