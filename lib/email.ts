// Transactional email via Resend (https://resend.com). Set RESEND_API_KEY (+ optional
// EMAIL_FROM once your domain is verified) in the environment to enable sending.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Resend's shared test sender works out of the box (only delivers to your own account
// in test mode). Swap for "MOBILE ICU <invoices@yourdomain>" after verifying a domain.
const EMAIL_FROM = process.env.EMAIL_FROM || "MOBILE ICU <onboarding@resend.dev>";

export function emailConfigured(): boolean {
  return !!RESEND_API_KEY;
}

export type EmailAttachment = { filename: string; content: string /* base64 */ };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<void> {
  if (!RESEND_API_KEY) throw new Error("Email isn't set up yet — add RESEND_API_KEY to the environment.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [opts.to], subject: opts.subject, html: opts.html, attachments: opts.attachments }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Email failed (${res.status}). ${t.slice(0, 300)}`);
  }
}
