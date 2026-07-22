import { describe, expect, it } from 'vitest'
import { fromStoredPrefs, prefsSchema, profileUpdateSchema, toStoredPrefs } from './profile'

const validUpdate = {
  displayName: 'Ayesha Khan',
  userType: 'student',
}

describe('profileUpdateSchema', () => {
  it('accepts a full update, uppercases country, and nulls empty optionals', () => {
    const parsed = profileUpdateSchema.parse({
      ...validUpdate,
      displayName: '  Ayesha Khan ',
      country: 'pk',
      institution: '   ',
      bio: '',
    })
    expect(parsed.displayName).toBe('Ayesha Khan')
    expect(parsed.country).toBe('PK')
    expect(parsed.institution).toBeNull()
    expect(parsed.bio).toBeNull()
  })

  it('enforces display name bounds (2–50)', () => {
    expect(profileUpdateSchema.safeParse({ ...validUpdate, displayName: 'Ab' }).success).toBe(true)
    expect(
      profileUpdateSchema.safeParse({ ...validUpdate, displayName: 'a'.repeat(50) }).success,
    ).toBe(true)
    expect(profileUpdateSchema.safeParse({ ...validUpdate, displayName: 'A' }).success).toBe(false)
    expect(
      profileUpdateSchema.safeParse({ ...validUpdate, displayName: 'a'.repeat(51) }).success,
    ).toBe(false)
  })

  it('rejects countries that are not exactly 2 letters', () => {
    expect(profileUpdateSchema.safeParse({ ...validUpdate, country: 'PAK' }).success).toBe(false)
  })

  it('keeps non-empty optionals and enforces the bio cap (280)', () => {
    const parsed = profileUpdateSchema.parse({
      ...validUpdate,
      institution: 'University of Karachi',
      bio: 'b'.repeat(280),
    })
    expect(parsed.institution).toBe('University of Karachi')
    expect(parsed.bio).toBe('b'.repeat(280))
    expect(profileUpdateSchema.safeParse({ ...validUpdate, bio: 'b'.repeat(281) }).success).toBe(
      false,
    )
  })
})

describe('prefsSchema', () => {
  it('accepts the locked theme + text size sets only', () => {
    expect(prefsSchema.safeParse({ theme: 'dark', textSize: 18 }).success).toBe(true)
    expect(prefsSchema.safeParse({ theme: 'sepia', textSize: 16 }).success).toBe(false)
    expect(prefsSchema.safeParse({ theme: 'light', textSize: 15 }).success).toBe(false)
  })
})

describe('stored prefs round-trip', () => {
  it('converts camel textSize to stored text_size and back', () => {
    const prefs = prefsSchema.parse({ theme: 'dark', textSize: 18 })
    const stored = toStoredPrefs(prefs)
    expect(stored).toEqual({ theme: 'dark', text_size: 18 })
    expect(fromStoredPrefs(stored)).toEqual(prefs)
  })

  it('falls back to defaults for empty, null, or legacy stored values', () => {
    expect(fromStoredPrefs({})).toEqual({ theme: 'system', textSize: 16 })
    expect(fromStoredPrefs(null)).toEqual({ theme: 'system', textSize: 16 })
    expect(fromStoredPrefs({ theme: 'light', text_size: 1 })).toEqual({
      theme: 'light',
      textSize: 16,
    })
  })
})
