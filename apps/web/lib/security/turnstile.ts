/**
 * Cloudflare Turnstile server-side verification (securities.md §6, §10:
 * Turnstile guards sign-up, password reset, waitlist, and the flag-gated
 * employer form). Extracted from the waitlist action so every guarded server
 * action shares one implementation.
 *
 * Behavior contract (matches the original waitlist block exactly):
 * - `TURNSTILE_SECRET_KEY` unset (dev) → verification is skipped: `true`.
 * - Secret set + no token → fail closed: `false`.
 * - Secret set + token → POST siteverify; any fetch/parse error → `false`.
 */
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(token: string | undefined): Promise<boolean> {
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY
  if (!turnstileSecret) {
    return true
  }

  if (!token) {
    return false
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: new URLSearchParams({
        secret: turnstileSecret,
        response: token,
      }),
    })
    const outcome = (await response.json()) as { success?: boolean }
    return outcome.success === true
  } catch {
    return false
  }
}
