import { describe, expect, it } from 'vitest'
import {
  buildCanonicalRequest,
  buildStringToSign,
  computeSignature,
  credentialScope,
  deriveSigningKey,
  encodeRfc3986,
  encodeS3Path,
  sha256Hex,
} from './r2-sigv4'

/*
 * The OFFICIAL AWS SigV4 worked example ("Example: Signature calculations",
 * AWS General Reference): GET https://iam.amazonaws.com/?Action=ListUsers&
 * Version=2010-05-08 at 20150830T123600Z with the documented example secret
 * key. Every intermediate below — canonical-request hash, signing key,
 * final signature — is the value AWS publishes, so the math is verified
 * against the spec, not assumed.
 */
const EXAMPLE = {
  accessKeyId: 'AKIDEXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'iam',
  amzDate: '20150830T123600Z',
  dateStamp: '20150830',
}

const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
const PUBLISHED_CANONICAL_REQUEST_HASH =
  'f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59'
const PUBLISHED_SIGNING_KEY_HEX = 'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9'
const PUBLISHED_SIGNATURE = '5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7'

function exampleCanonicalRequest() {
  return buildCanonicalRequest({
    method: 'GET',
    canonicalUri: '/',
    canonicalQueryString: 'Action=ListUsers&Version=2010-05-08',
    headers: {
      Host: 'iam.amazonaws.com',
      'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
      'X-Amz-Date': EXAMPLE.amzDate,
    },
    payloadHash: EMPTY_BODY_SHA256,
  })
}

describe('sha256Hex', () => {
  it('produces the documented empty-payload hash', () => {
    expect(sha256Hex('')).toBe(EMPTY_BODY_SHA256)
    expect(sha256Hex(new Uint8Array(0))).toBe(EMPTY_BODY_SHA256)
  })
})

describe('buildCanonicalRequest', () => {
  it('matches the published canonical form of the AWS example', () => {
    const { canonicalRequest, signedHeaders } = exampleCanonicalRequest()
    expect(signedHeaders).toBe('content-type;host;x-amz-date')
    expect(canonicalRequest).toBe(
      [
        'GET',
        '/',
        'Action=ListUsers&Version=2010-05-08',
        'content-type:application/x-www-form-urlencoded; charset=utf-8',
        'host:iam.amazonaws.com',
        `x-amz-date:${EXAMPLE.amzDate}`,
        '',
        'content-type;host;x-amz-date',
        EMPTY_BODY_SHA256,
      ].join('\n'),
    )
  })

  it('hashes to the published canonical-request digest', () => {
    const { canonicalRequest } = exampleCanonicalRequest()
    expect(sha256Hex(canonicalRequest)).toBe(PUBLISHED_CANONICAL_REQUEST_HASH)
  })
})

describe('buildStringToSign', () => {
  it('composes the published string to sign', () => {
    const { canonicalRequest } = exampleCanonicalRequest()
    const scope = credentialScope(EXAMPLE.dateStamp, EXAMPLE.region, EXAMPLE.service)
    expect(buildStringToSign({ amzDate: EXAMPLE.amzDate, scope, canonicalRequest })).toBe(
      [
        'AWS4-HMAC-SHA256',
        EXAMPLE.amzDate,
        '20150830/us-east-1/iam/aws4_request',
        PUBLISHED_CANONICAL_REQUEST_HASH,
      ].join('\n'),
    )
  })
})

describe('deriveSigningKey', () => {
  it('derives the published example signing key', () => {
    const key = deriveSigningKey(
      EXAMPLE.secretKey,
      EXAMPLE.dateStamp,
      EXAMPLE.region,
      EXAMPLE.service,
    )
    expect(key.toString('hex')).toBe(PUBLISHED_SIGNING_KEY_HEX)
  })
})

describe('computeSignature', () => {
  it('produces the published final signature end-to-end', () => {
    const { canonicalRequest } = exampleCanonicalRequest()
    const scope = credentialScope(EXAMPLE.dateStamp, EXAMPLE.region, EXAMPLE.service)
    const stringToSign = buildStringToSign({ amzDate: EXAMPLE.amzDate, scope, canonicalRequest })
    const signingKey = deriveSigningKey(
      EXAMPLE.secretKey,
      EXAMPLE.dateStamp,
      EXAMPLE.region,
      EXAMPLE.service,
    )
    expect(computeSignature(signingKey, stringToSign)).toBe(PUBLISHED_SIGNATURE)
  })
})

describe('encodeRfc3986 / encodeS3Path', () => {
  it('escapes the characters encodeURIComponent leaves alone', () => {
    expect(encodeRfc3986("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af')
  })

  it('encodes segments but preserves the path separators', () => {
    expect(encodeS3Path('audit/audit-2024.ndjson')).toBe('audit/audit-2024.ndjson')
    expect(encodeS3Path('a b/c=d')).toBe('a%20b/c%3Dd')
  })
})
