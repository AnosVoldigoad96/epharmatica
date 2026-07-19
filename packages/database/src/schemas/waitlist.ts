import { z } from 'zod'

/**
 * Waitlist signup (S12 / master §7.1, v1.7): email + module of interest + role.
 * Role labels are the locked S12 set — Student / Professional / Other.
 * Shared client/server: the form and the server action validate with the same schema.
 */
export const WAITLIST_MODULES = [
  'learning',
  'ai-study-tools',
  'community',
  'blog',
  'jobs',
  'resume-builder',
] as const

export const WAITLIST_ROLES = ['student', 'professional', 'other'] as const

export const waitlistSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  module: z.enum(WAITLIST_MODULES, { message: 'Pick the module you care about most' }),
  role: z.enum(WAITLIST_ROLES, { message: 'Pick the closest match' }),
})

export type WaitlistSignup = z.infer<typeof waitlistSignupSchema>
