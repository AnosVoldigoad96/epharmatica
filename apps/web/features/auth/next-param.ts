/**
 * `next` query-param helper for the auth surfaces (M2: the pre-auth location
 * follows the user through every flow). Pure and isomorphic — used by the
 * pages (RSC) and the client forms to build cross-links that keep carrying
 * the destination. Values must already be sanitized (sanitizeNextPath).
 */
export function withNext(path: string, next: string): string {
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`
}
