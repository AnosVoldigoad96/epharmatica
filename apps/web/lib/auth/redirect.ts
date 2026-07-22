/**
 * `next` param sanitizer — the pre-auth location carried through every auth
 * flow (M2). Open-redirect guard: only same-origin absolute paths survive.
 * Pure on purpose (no `server-only`) — shared by server actions, the
 * callback route handler, and client navigation; unit-tested with Vitest.
 */

/**
 * Accepts only paths that start with a single `/` (never `//`, which
 * browsers treat as protocol-relative) and contain no backslash (`\` is
 * normalized to `/` by some parsers). Everything else → `fallback`.
 */
export function sanitizeNextPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) {
    return fallback
  }
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback
  }
  return raw
}
