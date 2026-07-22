import { describe, expect, it } from 'vitest'
import {
  oauthCompleteSchema,
  passwordSchema,
  signInSchema,
  signUpSchema,
  usernameSchema,
} from './auth'

const validSignUp = {
  email: 'ayesha@example.com',
  password: 'a'.repeat(10),
  username: 'ayesha-k',
  displayName: 'Ayesha Khan',
  ageConfirm: true,
}

describe('usernameSchema', () => {
  it('trims and lowercases before validating', () => {
    expect(usernameSchema.parse('  Ayesha_K  ')).toBe('ayesha_k')
  })

  it('accepts separators in the middle (a-b)', () => {
    expect(usernameSchema.parse('a-b')).toBe('a-b')
  })

  it.each(['-ab', 'ab-', '_ab', 'ab_'])('rejects a separator at the edge (%s)', (value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false)
  })

  it('enforces the 3–20 length bounds', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(usernameSchema.safeParse('abc').success).toBe(true)
    expect(usernameSchema.safeParse('a'.repeat(20)).success).toBe(true)
    expect(usernameSchema.safeParse('a'.repeat(21)).success).toBe(false)
  })
})

describe('passwordSchema', () => {
  it('accepts 10 and 72 characters, rejects 9 and 73', () => {
    expect(passwordSchema.safeParse('a'.repeat(9)).success).toBe(false)
    expect(passwordSchema.safeParse('a'.repeat(10)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(72)).success).toBe(true)
    expect(passwordSchema.safeParse('a'.repeat(73)).success).toBe(false)
  })
})

describe('signUpSchema', () => {
  it('accepts a valid signup and normalizes the email', () => {
    const parsed = signUpSchema.parse({ ...validSignUp, email: '  Ayesha@Example.COM ' })
    expect(parsed.email).toBe('ayesha@example.com')
  })

  it('enforces display name bounds (2–50)', () => {
    expect(signUpSchema.safeParse({ ...validSignUp, displayName: 'Ab' }).success).toBe(true)
    expect(signUpSchema.safeParse({ ...validSignUp, displayName: 'a'.repeat(50) }).success).toBe(
      true,
    )
    expect(signUpSchema.safeParse({ ...validSignUp, displayName: 'A' }).success).toBe(false)
    expect(signUpSchema.safeParse({ ...validSignUp, displayName: 'a'.repeat(51) }).success).toBe(
      false,
    )
  })

  it('requires the 13+ confirmation to be literally true', () => {
    expect(signUpSchema.safeParse({ ...validSignUp, ageConfirm: false }).success).toBe(false)
  })
})

describe('signInSchema', () => {
  it('accepts an email + non-empty password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
  })

  it('rejects an empty password', () => {
    expect(signInSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })
})

describe('oauthCompleteSchema', () => {
  it('accepts username + user type + 13+ confirmation', () => {
    expect(
      oauthCompleteSchema.safeParse({ username: 'ayesha-k', userType: 'student', ageConfirm: true })
        .success,
    ).toBe(true)
  })

  it('rejects user types outside the locked set', () => {
    expect(
      oauthCompleteSchema.safeParse({
        username: 'ayesha-k',
        userType: 'professional',
        ageConfirm: true,
      }).success,
    ).toBe(false)
  })
})
