'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Field, fieldClass } from '@epharmatica/ui'
import { requestPasswordReset } from '../actions'
import { TurnstileWidget } from './turnstile-widget'

/**
 * Forgot-password form (M2 §4.3 · securities.md §10): email + Turnstile +
 * one verb. Success replaces the form with the verbatim non-enumerating
 * line — "If that account exists, we've emailed a link" — as a role='status'
 * panel; whether the account exists never shows.
 */
export function ForgotPasswordForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const t = useTranslations('auth.forgotPassword')
  const tErrors = useTranslations('auth.errors')

  const [email, setEmail] = useState('')
  const [token, setToken] = useState<string | undefined>(undefined)
  const [resetKey, setResetKey] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const statusRef = useRef<HTMLParagraphElement | null>(null)
  const errorRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    if (done) {
      statusRef.current?.focus()
    }
  }, [done])

  // Submit-level errors must scroll into view on submit (STYLE §6.7).
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [error])

  if (done) {
    return (
      <p
        role="status"
        tabIndex={-1}
        ref={statusRef}
        className="border-s-2 border-primary bg-primary-tint px-3.5 py-2.5 text-[13.5px] leading-[1.5] outline-none"
      >
        {t('done')}
      </p>
    )
  }

  const failTurnstile = () => {
    setToken(undefined)
    setResetKey((key) => key + 1)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) {
      return
    }
    setError(null)
    setPending(true)
    try {
      const result = await requestPasswordReset({ email, turnstileToken: token })
      if (result.ok) {
        setDone(true)
      } else {
        setError(result.error)
        failTurnstile()
      }
    } catch {
      setError(tErrors('generic'))
      failTurnstile()
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label={t('email')} labelFor="forgot-email">
        <input
          id="forgot-email"
          name="email"
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${fieldClass} placeholder:text-ink-2`}
        />
      </Field>

      <TurnstileWidget siteKey={turnstileSiteKey} onToken={setToken} resetKey={resetKey} />

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
