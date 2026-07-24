'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, fieldClass } from '@epharmatica/ui'
import { createClient } from '@/lib/supabase/client'

/**
 * TOTP challenge (M4-5 step-up): the session is aal1 with a verified
 * factor pending. Challenge + verify against the first verified TOTP
 * factor; success refreshes the session cookies (browser client) and
 * continues to `next`. No session → sign-in; no verified factor → the
 * step-up was a stale signal, continue.
 */
export function MfaChallengeForm({ next }: { next: string }) {
  const t = useTranslations('auth.mfa')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    void supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (cancelled) return
      if (listError) {
        router.replace('/auth/sign-in')
        return
      }
      const verified = (data?.totp ?? []).find((factor) => factor.status === 'verified')
      if (!verified) {
        router.replace(next)
        router.refresh()
        return
      }
      setFactorId(verified.id)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [next, router])

  const submit = () => {
    if (!factorId || code.trim().length < 6) return
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })
      if (challengeError || !challenge) {
        setError(t('error'))
        return
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyError) {
        setError(t('wrongCode'))
        setCode('')
        return
      }
      router.replace(next)
      router.refresh()
    })
  }

  const signOut = () => {
    startTransition(async () => {
      await createClient().auth.signOut()
      router.replace('/auth/sign-in')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-ink-2">{t('help')}</p>
      {loaded ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4"
        >
          <Field label={t('codeLabel')} labelFor="mfa-code" error={error}>
            <input
              id="mfa-code"
              className={`${fieldClass} w-40 font-mono tracking-[0.2em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              autoFocus
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <div className="flex items-center gap-4">
            <Button type="submit" pending={pending} disabled={code.trim().length < 6}>
              {t('verify')}
            </Button>
            <button
              type="button"
              onClick={signOut}
              className="text-[13px] text-ink-2 underline-offset-2 hover:underline"
            >
              {t('signOut')}
            </button>
          </div>
        </form>
      ) : (
        <div className="h-24 animate-pulse border border-line bg-surface" />
      )}
    </div>
  )
}
