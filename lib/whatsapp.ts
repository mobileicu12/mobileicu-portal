// WhatsApp sending via the WhatsApp Cloud API (Meta Graph API).
// Credentials live in the secured `portal.integrations` metafield (see settings.ts):
//   • whatsappToken   — a permanent/system-user access token
//   • whatsappPhoneId — the phone-number ID of your WhatsApp Business number
// Until both are set, waConfigured() is false and nothing is ever sent.
//
// NOTE: business-initiated messages outside the 24-hour customer window must use an
// approved message *template*. Set `whatsappTemplate` to send via that template; the
// day summary is passed as its first body parameter. With no template we send plain
// text (works inside an open conversation window).
import { getIntegrations } from "./settings";

const GRAPH_VERSION = "v21.0";

export async function waConfigured(): Promise<boolean> {
  const i = await getIntegrations();
  return !!(i.whatsappToken && i.whatsappPhoneId);
}

// Best-effort E.164 normalisation (digits only, no +). Assumes UK for local 0… numbers.
export function normalizePhone(raw: string): string | null {
  let d = (raw || "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "44" + d.slice(1);
  return d.length >= 8 ? d : null;
}

export async function sendWhatsApp(toPhone: string, message: string): Promise<void> {
  const i = await getIntegrations();
  if (!i.whatsappToken || !i.whatsappPhoneId) throw new Error("WhatsApp API not configured.");
  const to = normalizePhone(toPhone);
  if (!to) throw new Error("Invalid phone number.");

  const body = i.whatsappTemplate
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: i.whatsappTemplate,
          language: { code: "en" },
          components: [{ type: "body", parameters: [{ type: "text", text: message.slice(0, 1000) }] }],
        },
      }
    : { messaging_product: "whatsapp", to, type: "text", text: { preview_url: false, body: message.slice(0, 4000) } };

  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${i.whatsappPhoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${i.whatsappToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}). ${t.slice(0, 300)}`);
  }
}
