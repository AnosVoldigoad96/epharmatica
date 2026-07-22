'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, fieldClass } from '@epharmatica/ui'
import { MIN_PASSWORD_SCORE, passwordStrength } from '@/lib/security/password-strength'
import { updatePassword } from '../actions'
import { STRENGTH_SENTINEL, StrengthHint } from './strength-hint'
import { usePasswordStrength } from './use-password-strength'

/**
 * Reset-password form (M2 §4.3): new password with the live strength helper,
 * one verb. Runs on the recovery session the callback route minted — which
 * is a real session, so success navigates straight to `next` signed in.
 * Client-side zxcvbn ≥ 2 gate; the action re-checks.
 */
export function ResetPasswordForm({ next, email }: { next: string; email?: string }) {
  const t = useTranslations('auth.resetPassword')
  const tErrors = useTranslations('auth.errors')
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement | null>(null)

  const liveScore = usePasswordStrength(password, [email ?? ''])

  // Submit-level errors must scroll into view on submit (STYLE §6.7).
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [error])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) {
      return
    }
    setError(null)
    setPending(true)
    try {
      const { score } = await passwordStrength(password, [email ?? ''])
      if (score < MIN_PASSWORD_SCORE) {
        setError(tErrors('passwordTooWeak'))
        return
      }

      const result = await updatePassword({ password })
      if (result.ok) {
        router.push(next)
        router.refresh()
      } else {
        setError(result.error)
      }
    } catch {
      setError(tErrors('generic'))
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field
        label={t('password')}
        labelFor="reset-password"
        hint={
          <StrengthHint
            template={t('passwordHelper', { strength: STRENGTH_SENTINEL })}
            score={liveScore}
          />
        }
      >
        <input
          id="reset-password"
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={72}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
      </Field>

      <Button type="submit" pending={pending} className="w-full">
        {t('submit')}
      </Button>

      {error ? (
        <p ref={errorRef} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
