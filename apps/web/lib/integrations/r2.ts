/**
 * Cloudflare R2 (S3-compatible) PUT via hand-rolled SigV4 — invariant I10:
 * outbound integrations live in lib/integrations/*. Plain fetch + node:crypto
 * on purpose (no AWS SDK — locked dependency decision); the signing math is
 * the pure module r2-sigv4.ts, unit-tested against the official AWS example.
 *
 * Used by the yearly audit-export cron (M4 §9 D-b): objects go to
 * `{R2_ENDPOINT}/{R2_AUDIT_BUCKET}/{key}` with a signed payload hash
 * (x-amz-content-sha256), region 'auto', service 's3'. Env unset → the cron
 * no-ops via r2Configured(). Never throws — failures return `{ ok: false }`.
 */
import 'server-only'

import {
  buildCanonicalRequest,
  buildStringToSign,
  computeSignature,
  credentialScope,
  deriveSigningKey,
  encodeS3Path,
  sha256Hex,
} from './r2-sigv4'

const REGION = 'auto'
const SERVICE = 's3'

/** All four R2 envs present — the audit-export cron is a no-op otherwise. */
export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_AUDIT_BUCKET,
  )
}

/** `20260724T120000Z` / `20260724` from a Date, per the SigV4 spec. */
function amzTimestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
  return { amzDate, dateStamp: amzDate.slice(0, 8) }
}

export async function putR2Object(
  key: string,
  body: string | Uint8Array,
  contentType: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const endpoint = process.env.R2_ENDPOINT
    const accessKeyId = process.env.R2_ACCESS_KEY_ID
    const secretKey = process.env.R2_SECRET_ACCESS_KEY
    const bucket = process.env.R2_AUDIT_BUCKET
    if (!endpoint || !accessKeyId || !secretKey || !bucket) {
      return { ok: false, error: 'r2-unconfigured' }
    }

    const base = new URL(endpoint)
    const basePath = base.pathname.replace(/\/+$/, '')
    const canonicalUri = `${basePath}/${encodeS3Path(bucket)}/${encodeS3Path(key)}`

    // Sign the exact bytes sent (payload hash is part of the signature).
    const payload: Uint8Array = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
    const payloadHash = sha256Hex(payload)

    const { amzDate, dateStamp } = amzTimestamps(new Date())
    const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
      method: 'PUT',
      canonicalUri,
      canonicalQueryString: '',
      headers: {
        host: base.host,
        'content-type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      payloadHash,
    })
    const scope = credentialScope(dateStamp, REGION, SERVICE)
    const stringToSign = buildStringToSign({ amzDate, scope, canonicalRequest })
    const signature = computeSignature(
      deriveSigningKey(secretKey, dateStamp, REGION, SERVICE),
      stringToSign,
    )
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

    const response = await fetch(`${base.origin}${canonicalUri}`, {
      method: 'PUT',
      headers: {
        authorization,
        'content-type': contentType,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
      },
      body: payload as BodyInit,
    })
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 500)
      return { ok: false, status: response.status, error: detail || `HTTP ${response.status}` }
    }
    return { ok: true, status: response.status }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unknown-error' }
  }
}
