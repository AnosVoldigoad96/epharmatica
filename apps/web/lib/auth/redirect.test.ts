import { describe, expect, it } from 'vitest'
import { sanitizeNextPath } from './redirect'

describe('sanitizeNextPath', () => {
  it('passes through same-origin absolute paths', () => {
    expect(sanitizeNextPath('/')).toBe('/')
    expect(sanitizeNextPath('/settings/profile')).toBe('/settings/profile')
    expect(sanitizeNextPath('/learn?topic=abc#s2')).toBe('/learn?topic=abc#s2')
  })

  it('falls back on empty, null, and undefined', () => {
    expect(sanitizeNextPath(null)).toBe('/')
    expect(sanitizeNextPath(undefined)).toBe('/')
    expect(sanitizeNextPath('')).toBe('/')
  })

  it('rejects absolute URLs and relative paths', () => {
    expect(sanitizeNextPath('https://evil.example')).toBe('/')
    expect(sanitizeNextPath('settings/profile')).toBe('/')
    expect(sanitizeNextPath('../admin')).toBe('/')
  })

  it('rejects protocol-relative // paths', () => {
    expect(sanitizeNextPath('//evil.example')).toBe('/')
    expect(sanitizeNextPath('//evil.example/path')).toBe('/')
  })

  it('rejects backslash smuggling', () => {
    expect(sanitizeNextPath('/\\evil.example')).toBe('/')
    expect(sanitizeNextPath('\\\\evil.example')).toBe('/')
  })

  it('honors a custom fallback', () => {
    expect(sanitizeNextPath('https://evil.example', '/dashboard')).toBe('/dashboard')
    expect(sanitizeNextPath(null, '/dashboard')).toBe('/dashboard')
  })
})
