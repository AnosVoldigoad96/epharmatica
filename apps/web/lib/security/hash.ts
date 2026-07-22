/**
 * Keyed hashing for rate-limit identifiers and audit IPs (securities.md §6,
 * §13: auth events and audit entries store HASHED IPs — never raw; the
 * password-reset limit keys on a hashed identifier, not IP).
 *
 * HMAC-SHA256 with `IP_HASH_SECRET` (dev fallback `'dev-only-hash-key'`) so
 * hashes are stable within a deployment but useless without the key.
 */
import 'server-only'

import { createHmac } from 'node:crypto'
import { headers } from 'next/headers'

export function hmacHash(value: string): string {
  const secret = process.env.IP_HASH_SECRET ?? 'dev-only-hash-key'
  return createHmac('sha256', secret).update(value).digest('hex')
}

/**
 * Hash of the client IP, best-effort behind Cloudflare + the VPS proxy:
 * `cf-connecting-ip` → first hop of `x-forwarded-for` → `x-real-ip` → null.
 */
export async function getClientIpHash(): Promise<string | null> {
  const headerStore = await headers()

  const cfIp = headerStore.get('cf-connecting-ip')
  if (cfIp) {
    return hmacHash(cfIp.trim())
  }

  const forwardedFor = headerStore.get('x-forwarded-for')
  const firstHop = forwardedFor?.split(',')[0]?.trim()
  if (firstHop) {
    return hmacHash(firstHop)
  }

  const realIp = headerStore.get('x-real-ip')
  if (realIp) {
    return hmacHash(realIp.trim())
  }

  return null
}

/** Identifier hash for email-keyed limits (reset bucket): trimmed, lowercased. */
export function identifierHash(email: string): string {
  return hmacHash(email.trim().toLowerCase())
}
