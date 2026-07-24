'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, fieldClass } from '@epharmatica/ui'
import { resendVerification, signInWithEmail } from '../actions'
import { withNext } from '../next-param'
import { AuthDivider } from './auth-divider'
import { GoogleButton } from './google-button'

/**
 * Sign-in form (wireframe 1o · hi-fi 3k · M2 §4.3): Google ghost → OR →
 * EMAIL → PASSWORD → Sign in → Forgot password + the sign-up cross-link
 * (deliberate addition — the canvases omit the reverse link). An
 * email_not_confirmed failure surfaces the Resend verification email ghost
 * button (rate-limited server-side). Success navigates to `next`.
 */
const LINK_CLASSES =
  'underline decoration-primary decoration-1 underline-offset-2 hover:decoration-2'

export function SignInForm({ next }: { next: string }) {
  const t = useTranslations('auth.signIn')
  const tErrors = useTranslations('auth.errors')
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canResend, setCanResend] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'pending' | 'done'>('idle')
  const errorRef = useRef<HTMLParagraphElement | null>(null)

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
    setCanResend(false)
    setPending(true)
    try {
      const result = await signInWithEmail({ email, password, next })
      if (result.ok) {
        router.push(result.mfaRequired ? withNext('/auth/mfa', next) : next)
        router.refresh()
      } else {
        setError(result.error)
        setCanResend(result.canResend === true)
        setResendState('idle')
      }
    } catch {
      setError(tErrors('generic'))
    } finally {
      setPending(false)
    }
  }

  const handleResend = async () => {
    if (resendState === 'pending') {
      return
    }
    setResendState('pending')
    try {
      // No session exists after an email_not_confirmed failure — the action
      // takes the typed email and stays rate-limited + non-enumerating.
      const result = await resendVerification(email)
      if (result.ok) {
        setResendState('done')
      } else {
        setError(result.error)
        setResendState('idle')
      }
    } catch {
      setError(tErrors('generic'))
      setResendState('idle')
    }
  }

  return (
    <div>
      <div className="mt-5">
        <GoogleButton next={next} label={t('google')} />
      </div>
      <AuthDivider label={t('or')} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label={t('email')} labelFor="sign-in-email">
          <input
            id="sign-in-email"
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

        <Field label={t('password')} labelFor="sign-in-password">
          <input
            id="sign-in-password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={fieldClass}
          />
        </Field>

        <Button type="submit" pending={pending} className="mt-2 w-full">
          {t('submit')}
        </Button>

        {error ? (
          <p ref={errorRef} role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        {canResend && resendState !== 'done' ? (
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              pending={resendState === 'pending'}
              onClick={handleResend}
            >
              {t('resendVerification')}
            </Button>
          </div>
        ) : null}
        {resendState === 'done' ? (
          <p role="status" className="text-[13px] text-ink-2">
            {t('resendDone')}
          </p>
        ) : null}
      </form>

      <p className="mt-3.5 text-[13px]">
        <Link href="/auth/forgot-password" className={`text-ink ${LINK_CLASSES}`}>
          {t('forgotPassword')}
        </Link>
      </p>
      <p className="mt-2 text-[13px] text-ink-2">
        {t.rich('noAccount', {
          link: (chunks) => (
            <Link href={withNext('/auth/sign-up', next)} className={`text-ink ${LINK_CLASSES}`}>
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  )
}
