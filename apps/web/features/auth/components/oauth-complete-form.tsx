'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { USER_TYPES, type UserType } from '@epharmatica/database'
import {
  Button,
  Checkbox,
  Field,
  MonographLabel,
  SegmentedControl,
  fieldClass,
} from '@epharmatica/ui'
import { completeOauthProfile } from '../actions'
import { UsernameStatus } from './username-status'
import { useUsernameAvailability } from './use-username-availability'

/**
 * OAuth first-time completion (wireframe 1n · hi-fi 3j · M2 §4.2): eyebrow
 * ONE MORE STEP → H1 → "Signed in as {email}…" explainer → USERNAME —
 * PERMANENT (availability + verbatim amber warning) → I AM A segmented
 * control (Student default) → 13+ checkbox (starts UNCHECKED — the hi-fi's
 * pre-checked state doesn't carry over) → Finish and start learning. The
 * profile row is created only here; success lands back at `next`.
 */
const LINK_CLASSES =
  'underline decoration-primary decoration-1 underline-offset-2 hover:decoration-2'

export function OauthCompleteForm({ email, next }: { email: string; next: string }) {
  const t = useTranslations('auth.complete')
  const tErrors = useTranslations('auth.errors')
  const router = useRouter()

  const [username, setUsername] = useState('')
  const [userType, setUserType] = useState<UserType>('student')
  const [ageConfirm, setAgeConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement | null>(null)

  const availability = useUsernameAvailability(username)

  // Submit-level errors must scroll into view on submit (STYLE §6.7).
  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [error])

  // TODO(observability): fire EVENTS.oauth_completion_shown when the Umami
  // send helper lands (rules.md §11) — the taxonomy is constants-only today.

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) {
      return
    }
    setError(null)
    setPending(true)
    try {
      const result = await completeOauthProfile({ username, userType, ageConfirm })
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
    <div>
      <MonographLabel as="div" rule="hard">
        {t('eyebrow')}
      </MonographLabel>
      <h1 className="mb-2 mt-3.5 font-display text-[22px] font-bold tracking-[-0.02em]">
        {t('title')}
      </h1>
      <p className="text-[13.5px] leading-[1.6] text-ink-2">
        {t.rich('signedInAs', {
          email,
          strong: (chunks) => <strong className="font-semibold text-ink">{chunks}</strong>,
        })}
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
        <Field
          label={t('username')}
          labelFor="complete-username"
          trailing={availability === 'idle' ? null : <UsernameStatus state={availability} />}
          hint={<span className="text-warn">{t('usernameHelper')}</span>}
        >
          <input
            id="complete-username"
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

        <Field label={t('userType')}>
          <SegmentedControl
            options={USER_TYPES.map((value) => ({ value, label: t(`userTypes.${value}`) }))}
            value={userType}
            onChange={(value) => setUserType(value as UserType)}
            label={t('userType')}
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

        <Button type="submit" pending={pending} className="w-full">
          {t('submit')}
        </Button>

        {error ? (
          <p ref={errorRef} role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
