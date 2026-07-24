/**
 * Pure AWS Signature V4 math (node:crypto only — no new dependency, the
 * locked-deps decision). Split from lib/integrations/r2.ts the same way
 * rate-limit-window.ts is split from rate-limit.ts: this module imports no
 * `server-only`, so the vitest suite (lib/**\/*.test.ts) can pin the official
 * AWS SigV4 example — canonical-request hash, signing key, and final
 * signature — against the documented values.
 */
import { createHash, createHmac } from 'node:crypto'

/** Lowercase hex SHA-256 — payload hashes and the canonical-request hash. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

/** HMAC-SHA256 → raw bytes (the signing-key derivation chain). */
export function hmacSha256(key: string | Uint8Array, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

/** RFC 3986 encoding — like encodeURIComponent, but !'()* are escaped too. */
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

/** S3-style canonical path: each segment RFC 3986-encoded once, '/' kept. */
export function encodeS3Path(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/')
}

export type CanonicalRequestInput = {
  method: string
  /** Already-encoded absolute path ('/' for the bare root). */
  canonicalUri: string
  /** Sorted, RFC 3986-encoded query string ('' when none). */
  canonicalQueryString: string
  /** Headers to sign — names are lowercased, values trimmed, then sorted. */
  headers: Record<string, string>
  /** Hex SHA-256 of the payload (empty-string hash for bodyless requests). */
  payloadHash: string
}

/**
 * The canonical request per the SigV4 spec: method, URI, query, canonical
 * headers (each `name:value\n`), signed-header list, payload hash — joined
 * with '\n'. Returns the signed-header list too (the Authorization header
 * needs it verbatim).
 */
export function buildCanonicalRequest(input: CanonicalRequestInput): {
  canonicalRequest: string
  signedHeaders: string
} {
  const entries = Object.entries(input.headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1))
  const canonicalHeaders = entries.map(([name, value]) => `${name}:${value}\n`).join('')
  const signedHeaders = entries.map(([name]) => name).join(';')
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.canonicalUri,
    input.canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    input.payloadHash,
  ].join('\n')
  return { canonicalRequest, signedHeaders }
}

/** `{dateStamp}/{region}/{service}/aws4_request` — the credential scope. */
export function credentialScope(dateStamp: string, region: string, service: string): string {
  return `${dateStamp}/${region}/${service}/aws4_request`
}

/** The string to sign: algorithm, timestamp, scope, canonical-request hash. */
export function buildStringToSign(input: {
  amzDate: string
  scope: string
  canonicalRequest: string
}): string {
  return ['AWS4-HMAC-SHA256', input.amzDate, input.scope, sha256Hex(input.canonicalRequest)].join(
    '\n',
  )
}

/** kSigning = HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request"). */
export function deriveSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp)
  const kRegion = hmacSha256(kDate, region)
  const kService = hmacSha256(kRegion, service)
  return hmacSha256(kService, 'aws4_request')
}

/** Final hex signature: HMAC(signingKey, stringToSign). */
export function computeSignature(signingKey: Uint8Array, stringToSign: string): string {
  return createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex')
}
