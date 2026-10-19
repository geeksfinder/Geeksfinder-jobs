import { esc } from "./telegram";

/**
 * The sign-in code email, sent by GeeksFinder through Brevo (not Supabase's default "magic link" email).
 * Colours are DESIGN.md tokens written out, because email clients can't read CSS variables.
 */
export function loginCodeEmail(code: string) {
  const safe = esc(code);
  return {
    // The code in the subject shows in the phone notification, so students can copy it without opening the email
    subject: `${code} is your GeeksFinder code`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#14213D">
  <p style="font-size:20px;font-weight:700;margin:0 0 16px">GeeksFinder</p>
  <p style="font-size:16px;line-height:26px;margin:0 0 16px;color:#4A5568">Here's your code to log in or sign up. Type it on the page where you entered your email.</p>
  <p style="font-size:32px;line-height:40px;font-weight:700;letter-spacing:6px;margin:0 0 16px;padding:16px 20px;background:#F5F7FA;border-radius:10px;text-align:center;color:#14213D">${safe}</p>
  <p style="font-size:14px;line-height:20px;margin:0 0 8px;color:#4A5568">It works once and expires soon. Never share it: GeeksFinder will never ask you for this code.</p>
  <p style="font-size:14px;line-height:20px;margin:0;color:#7A8494">Didn't ask for a code? You can ignore this email. Nobody can log in without it.</p>
</div>`,
  };
}
