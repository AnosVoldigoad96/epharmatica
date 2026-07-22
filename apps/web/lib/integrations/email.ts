/**
 * Transactional email via the Resend REST API — invariant I10: all outbound
 * integrations live in lib/integrations/*; email is transactional only,
 * never marketing (securities.md §9). Plain fetch on purpose — no SDK
 * (locked dependency decision for 1.A).
 *
 * The HTML wrapper here is a minimal neutral template around the plain-text
 * body; the full monograph-styled 8-template suite ships in Phase 1.F.
 *
 * `RESEND_API_KEY` unset (dev) → no-op `{ sent: false }`. Never throws —
 * a notification email must not break the flow that triggered it.
 */
import 'server-only'

const RESEND_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'ePharmatica <no-reply@epharmatica.com>'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Neutral fallback wrapper: mono-ish, paper-toned, text-first (1.F redoes this). */
function wrapHtml(text: string): string {
  const body = escapeHtml(text).replaceAll('\n', '<br />')
  return [
    '<div style="background:#FBFBF9;padding:32px 16px;">',
    '<div style="max-width:560px;margin:0 auto;border:1px solid #1A2226;background:#FFFFFF;padding:24px;',
    "font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:14px;line-height:1.6;color:#1A2226;\">",
    `<p style="margin:0 0 16px;letter-spacing:0.08em;font-size:11px;">EPHARMATICA</p>`,
    `<p style="margin:0;">${body}</p>`,
    '</div>',
    '</div>',
  ].join('')
}

export async function sendEmail(message: {
  to: string
  subject: string
  text: string
  html?: string
}): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false }
  }

  try {
    const response = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? wrapHtml(message.text),
      }),
    })
    return { sent: response.ok }
  } catch {
    return { sent: false }
  }
}
