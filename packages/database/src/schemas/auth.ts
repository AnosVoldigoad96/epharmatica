import { z } from 'zod'

/**
 * Account creation + sign-in contracts (M2 §4.1–§4.3 · securities.md §10).
 * Username rules mirror the profiles_username_format DB check (migration 002)
 * exactly. Passwords are length-only — 10–72 chars (bcrypt input limit), no
 * composition rules (M2 contract); strength is scored app-side with zxcvbn.
 * Shared client/server: the forms and the server actions validate with the
 * same schemas.
 */
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$/

export const USER_TYPES = ['student', 'pharmacist', 'other'] as const

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    USERNAME_REGEX,
    '3–20 characters — lowercase letters, numbers, _ or -, starting and ending with a letter or number',
  )

export const passwordSchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(72, 'At most 72 characters')

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: z.string().trim().min(2, '2–50 characters').max(50, '2–50 characters'),
  ageConfirm: z.literal(true, { message: 'Required' }),
})

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
})

export const oauthCompleteSchema = z.object({
  username: usernameSchema,
  userType: z.enum(USER_TYPES),
  ageConfirm: z.literal(true, { message: 'Required' }),
})

export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  password: passwordSchema,
})

export type UserType = (typeof USER_TYPES)[number]
export type SignUp = z.infer<typeof signUpSchema>
export type SignIn = z.infer<typeof signInSchema>
export type OauthComplete = z.infer<typeof oauthCompleteSchema>
export type ForgotPassword = z.infer<typeof forgotPasswordSchema>
export type ResetPassword = z.infer<typeof resetPasswordSchema>
