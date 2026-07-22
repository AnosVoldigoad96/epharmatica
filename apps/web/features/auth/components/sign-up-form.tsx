'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Checkbox, Field, MonographLabel, fieldClass } from '@epharmatica/ui'
import { MIN_PASSWORD_SCORE, passwordStrength } from '@/lib/security/password-strength'
import { signUpWithEmail } from '../actions'
import { withNext } from '../next-param'
import { AuthDivider } from './auth-divider'
import { GoogleButton } from './google-button'
import { STRENGTH_SENTINEL, StrengthHint } from './strength-hint'
import { TurnstileWidget } from './turnstile-widget'
import { UsernameStatus } from './username-status'
import { usePasswordStrength } from './use-password-strength'
import { useUsernameAvailability } from './use-username-availability'

/**
 * Sign-up form (wireframe 1m · hi-fi 3i · M2 §4.1): Google ghost → OR →
 * EMAIL → PASSWORD (live strength helper) → USERNAME (debounced
 * availability + the verbatim amber permanent-username warning) → DISPLAY
 * NAME → 13+/Terms/Privacy checkbox → Turnstile → Create account → "Already
 * here? Sign in". Success without a session replaces the card body with the
 * CHECK YOUR EMAIL state; with a session it navigates to `next`. Submit is
 * gated client-side on zxcvbn ≥ 2 (the action re-checks).
 */
const LINK_CLASSES =
  'underline decoration-primary decoration-1 underline-offset-2 hover:decoration-2'

export function SignUpForm({
  next,
  turnstileSiteKey,
}: {
  next: string
  turnstileSiteKey?: string
}) {
  const t = useTranslations('auth.signUp')
  const tErrors = useTranslations('auth.errors')
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [ageConfirm, setAgeConfirm] = useState(false)
  const [token, setToken] = useState<string | undefined>(undefined)
  const [resetKey, setResetKey] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const statusRef = useRef<HTMLDivElement | null>(null)
  const errorRef = useRef<HTMLParagraphElement | null>(null)

  const availability = useUsernameAvailability(username)
  const liveScore = usePasswordStrength(password, [email, username, displayName])

  // The success state replaces the whole card body — move focus onto it so
  // keyboard users aren't dropped; role="status" announces it.
  useEffect(() => {
    if (sentTo) {
      statusRef.current?.focus()
    }
  }, [sentTo])

  // Submit-level errors must scroll into view on submit (STYLE §6.7).
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [error])

  if (sentTo) {
    return (
      <div role="status" tabIndex={-1} ref={statusRef} className="outline-none">
        <MonographLabel as="h1" rule="hard">
          {t('checkEmail.label')}
        </MonographLabel>
        <p className="mt-4 text-[14px] leading-[1.6]">
          {t('checkEmail.message', { email: sentTo })}
        </p>
        <p className="mt-3 text-[13px] leading-[1.5] text-ink-2">{t('checkEmail.resendNote')}</p>
      </div>
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
      // Definitive client-side gate (not the debounced live score) — the
      // server re-checks with the same inputs.
      const { score } = await passwordStrength(password, [email, username, displayName])
      if (score < MIN_PASSWORD_SCORE) {
        setError(tErrors('passwordTooWeak'))
        return
      }

      const result = await signUpWithEmail({
        email,
        password,
        username,
        displayName,
        ageConfirm,
        turnstileToken: token,
        next,
      })
      if (result.ok) {
        if (result.signedIn) {
          router.push(next)
          router.refresh()
        } else {
          setSentTo(email)
        }
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
    <div>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">{t('title')}</h1>

      <div className="mt-5">
        <GoogleButton next={next} label={t('google')} />
      </div>
      <AuthDivider label={t('or')} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label={t('email')} labelFor="sign-up-email">
          <input
            id="sign-up-email"
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

        <Field
          label={t('password')}
          labelFor="sign-up-password"
          hint={
            <StrengthHint
              template={t('passwordHelper', { strength: STRENGTH_SENTINEL })}
              score={liveScore}
            />
          }
        >
          <input
            id="sign-up-password"
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

        <Field
          label={t('username')}
          labelFor="sign-up-username"
          trailing={availability === 'idle' ? null : <UsernameStatus state={availability} />}
          hint={<span className="text-warn">{t('usernameHelper')}</span>}
        >
          <input
            id="sign-up-username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={20}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            className={fieldClass}
          />
        </Field>

        <Field label={t('displayName')} labelFor="sign-up-display-name">
          <input
            id="sign-up-display-name"
            name="displayName"
            type="text"
            required
            minLength={2}
            maxLength={50}
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={fieldClass}
          />
        </Field>

        <Checkbox
          name="ageConfirm"
          required
          checked={ageConfirm}
          onChange={(event) => setAgeConfirm(event.target.checked)}
          label={t.rich('ageConfirm', {
            terms: (chunks) => (
              <Link href="/terms" className={LINK_CLASSES}>
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className={LINK_CLASSES}>
                {chunks}
              </Link>
            ),
          })}
        />

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

      <p className="mt-5 text-[13px] text-ink-2">
        {t.rich('haveAccount', {
          link: (chunks) => (
            <Link href={withNext('/auth/sign-in', next)} className={`text-ink ${LINK_CLASSES}`}>
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  )
}
