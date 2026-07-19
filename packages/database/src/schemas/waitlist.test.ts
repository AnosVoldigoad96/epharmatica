import { describe, expect, it } from 'vitest'
import { waitlistSignupSchema } from './waitlist'

describe('waitlistSignupSchema', () => {
  it('accepts a valid signup and normalizes the email', () => {
    const parsed = waitlistSignupSchema.parse({
      email: '  Ayesha@Example.COM ',
      module: 'learning',
      role: 'student',
    })
    expect(parsed.email).toBe('ayesha@example.com')
  })

  it('rejects an invalid email', () => {
    expect(
      waitlistSignupSchema.safeParse({ email: 'not-an-email', module: 'jobs', role: 'other' })
        .success,
    ).toBe(false)
  })

  it('rejects roles outside the locked S12 set', () => {
    expect(
      waitlistSignupSchema.safeParse({
        email: 'a@b.com',
        module: 'learning',
        role: 'pharmacist',
      }).success,
    ).toBe(false)
  })
})
