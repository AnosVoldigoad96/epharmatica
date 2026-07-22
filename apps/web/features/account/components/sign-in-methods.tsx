'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, MonographLabel, Stamp, fieldClass, useToast } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { removeSignInMethod, sendSetPasswordEmail, type RemovableProvider } from '../actions'

/**
 * Sign-in methods list (wireframe 1r · hi-fi 3n · M2 §4.3): Password row
 * (ACTIVE stamp / NOT SET chip + Set password ghost) and Google row (LINKED
 * stamp + mono identity email / NOT LINKED chip + link hint). Remove opens a
 * small inline confirm panel — re-auth password + danger Remove {method} +
 * Cancel. Both removal guards live server-side; a successful removal
 * refreshes the RSC-derived method list.
 */
const REMOVE_LINK_CLASSES =
  'inline-flex min-h-10 cursor-pointer items-center text-[13px] text-ink underline decoration-primary decoration-1 underline-offset-2 hover:decoration-2 [@media(pointer:coarse)]:min-h-11'

export function SignInMethodsPanel({
  hasPassword,
  googleLinked,
  googleEmail,
}: {
  hasPassword: boolean
  googleLinked: boolean
  googleEmail: string | null
}) {
  const t = useTranslations('settings.sessions')
  const { toast } = useToast()
  const router = useRouter()

  const [confirming, setConfirming] = useState<RemovableProvider | null>(null)
  const [password, setPassword] = useState('')
  const [removePending, setRemovePending] = useState(false)
  const [setPasswordPending, setSetPasswordPending] = useState(false)
  const passwordRef = useRef<HTMLInputElement | null>(null)

  // Opening the inline confirm panel must move focus into it (mirrors the
  // SignUpForm status-focus pattern) so keyboard users aren't left behind.
  useEffect(() => {
    if (confirming) {
      passwordRef.current?.focus()
    }
  }, [confirming])

  // Client-side mirror of the server guard: removable only while another
  // method remains.
  const removable = hasPassword && googleLinked
  const methodLabel = (provider: RemovableProvider) =>
    provider === 'google' ? t('google') : t('password')

  const openConfirm = (provider: RemovableProvider) => {
    setConfirming(provider)
    setPassword('')
  }

  const handleSetPassword = async () => {
    if (setPasswordPending) {
      return
    }
    setSetPasswordPending(true)
    try {
      const result = await sendSetPasswordEmail()
      if (result.ok) {
        toast({ title: t('setPasswordSent') })
      } else {
        toast({ title: result.error, variant: 'error' })
      }
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
    } finally {
      setSetPasswordPending(false)
    }
  }

  const handleRemove = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!confirming || removePending) {
      return
    }
    setRemovePending(true)
    try {
      const result = await removeSignInMethod({ provider: confirming, password })
      if (result.ok) {
        toast({ title: t('methodRemoved', { method: methodLabel(confirming) }) })
        setConfirming(null)
        setPassword('')
        router.refresh()
      } else {
        toast({ title: result.error, variant: 'error' })
      }
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
    } finally {
      setRemovePending(false)
    }
  }

  return (
    <div className="mt-5">
      <ul className="divide-y divide-line border border-line bg-surface">
        <li className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="text-[14px] text-ink">{t('password')}</span>
          {hasPassword ? <Stamp>{t('chipActive')}</Stamp> : <Chip>{t('chipNotSet')}</Chip>}
          <span className="flex-1" />
          {hasPassword && removable ? (
            <button
              type="button"
              onClick={() => openConfirm('email')}
              className={REMOVE_LINK_CLASSES}
            >
              {t('remove')}
            </button>
          ) : null}
          {!hasPassword ? (
            <Button
              variant="ghost"
              size="sm"
              pending={setPasswordPending}
              onClick={handleSetPassword}
            >
              {t('setPassword')}
            </Button>
          ) : null}
        </li>

        <li className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="text-[14px] text-ink">{t('google')}</span>
          {googleLinked ? (
            <>
              <Stamp>{t('chipLinked')}</Stamp>
              {googleEmail ? (
                <span className="min-w-0 truncate font-mono text-[11px] uppercase tracking-[0.05em] text-ink-2">
                  {googleEmail}
                </span>
              ) : null}
            </>
          ) : (
            <Chip>{t('chipNotLinked')}</Chip>
          )}
          <span className="flex-1" />
          {googleLinked && removable ? (
            <button
              type="button"
              onClick={() => openConfirm('google')}
              className={REMOVE_LINK_CLASSES}
            >
              {t('remove')}
            </button>
          ) : null}
        </li>
      </ul>

      {/* Linking happens by signing in with Google — no connect button in 1.A. */}
      {!googleLinked ? (
        <p className="mt-2 text-[12px] leading-[1.5] text-ink-2">{t('googleLinkHint')}</p>
      ) : null}

      {confirming ? (
        <form
          onSubmit={handleRemove}
          className="mt-4 flex flex-col gap-4 border border-ink bg-surface p-4"
        >
          <MonographLabel as="h3" size="sm">
            {t('removeTitle', { method: methodLabel(confirming) })}
          </MonographLabel>
          <Field label={t('reauthLabel')} labelFor="remove-method-password">
            <input
              ref={passwordRef}
              id="remove-method-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="danger" pending={removePending}>
              {t('confirmRemove', { method: methodLabel(confirming) })}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={removePending}
              onClick={() => setConfirming(null)}
            >
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
