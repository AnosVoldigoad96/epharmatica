'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { Factor } from '@supabase/supabase-js'
import { Button, Field, MonographLabel, Stamp, fieldClass, useToast } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { createClient } from '@/lib/supabase/client'

/**
 * Staff TOTP enrollment panel (M4-5 · §13 — TOTP ships, enforcement stays
 * OFF, accepted risk R-M4a). Rendered by /settings/sessions for staff roles
 * only; plain users keep the COMING SOON chip. Everything runs on the
 * BROWSER client against GoTrue MFA: list → enroll (QR data-URI + plain
 * secret) → challenge + verify → factor listed; unenroll behind an inline
 * confirm (the sign-in-methods pattern).
 *
 * PRD DEVIATION (documented): M4 §13 says "recovery codes via GoTrue MFA" —
 * GoTrue has NO native recovery codes, so none are issued. The panel says so
 * (totpRecoveryNote): a lost device means an admin removes the factor.
 *
 * GoTrue errors surface verbatim-ish through the totpError wrapper; a
 * 404 / "disabled"-mentioning 422 from enroll means MFA is switched off
 * server-side → mfaDisabledHint (may need a GoTrue env flip on the box).
 */
const LINK_CLASSES =
  'inline-flex min-h-10 cursor-pointer items-center text-[13px] text-ink underline decoration-primary decoration-1 underline-offset-2 hover:decoration-2 [@media(pointer:coarse)]:min-h-11'

type EnrollingFactor = { id: string; qr: string; secret: string }

export function TotpPanel() {
  const t = useTranslations('settings.sessions')
  const { toast } = useToast()

  const [factors, setFactors] = useState<Factor[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [friendlyName, setFriendlyName] = useState('')
  const [enrolling, setEnrolling] = useState<EnrollingFactor | null>(null)
  const [code, setCode] = useState('')
  const [enrollPending, setEnrollPending] = useState(false)
  const [verifyPending, setVerifyPending] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [removePending, setRemovePending] = useState(false)
  const codeRef = useRef<HTMLInputElement | null>(null)

  /** Current TOTP factors from GoTrue, or null on any failure. */
  const loadTotpFactors = useCallback(async (): Promise<Factor[] | null> => {
    try {
      const { data, error } = await createClient().auth.mfa.listFactors()
      if (error || !data) {
        return null
      }
      return data.all.filter((factor) => factor.factor_type === 'totp')
    } catch {
      return null
    }
  }, [])

  const applyFactors = useCallback((next: Factor[] | null) => {
    if (next === null) {
      setLoadFailed(true)
      setFactors((current) => current ?? [])
    } else {
      setLoadFailed(false)
      setFactors(next)
    }
  }, [])

  const refreshFactors = useCallback(async () => {
    applyFactors(await loadTotpFactors())
  }, [applyFactors, loadTotpFactors])

  // Mount-time list — state lands from the async callback only (the
  // use-password-strength pattern), with unmount cancellation.
  useEffect(() => {
    let cancelled = false
    void loadTotpFactors().then((next) => {
      if (!cancelled) {
        applyFactors(next)
      }
    })
    return () => {
      cancelled = true
    }
  }, [applyFactors, loadTotpFactors])

  // Entering the verify step moves focus to the code input (the
  // SignInMethodsPanel status-focus pattern) — keyboard users included.
  useEffect(() => {
    if (enrolling) {
      codeRef.current?.focus()
    }
  }, [enrolling])

  /**
   * GoTrue errors, verbatim-ish behind a friendly wrapper. A 404 (MFA routes
   * absent) or a 422 mentioning "disabled"/"not enabled" means TOTP is off
   * server-side → the mfaDisabledHint copy instead of the raw message.
   */
  const surfaceMfaError = (error: { status?: number; message?: string } | null | undefined) => {
    const message = error?.message ?? ''
    const mfaDisabled =
      error?.status === 404 || (error?.status === 422 && /disabled|not enabled/i.test(message))
    if (mfaDisabled) {
      toast({ title: t('mfaDisabledHint'), variant: 'error' })
    } else if (message) {
      toast({ title: t('totpError', { message }), variant: 'error' })
    } else {
      toast({ title: t('errors.generic'), variant: 'error' })
    }
  }

  const handleEnroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (enrollPending || enrolling) {
      return
    }
    setEnrollPending(true)
    try {
      const { data, error } = await createClient().auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: friendlyName.trim() || undefined,
      })
      if (error || !data) {
        surfaceMfaError(error)
        return
      }
      setCode('')
      setEnrolling({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
    } finally {
      setEnrollPending(false)
    }
  }

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!enrolling || verifyPending) {
      return
    }
    setVerifyPending(true)
    try {
      const supabase = createClient()
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrolling.id,
      })
      if (challengeError || !challenge) {
        surfaceMfaError(challengeError)
        return
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrolling.id,
        challengeId: challenge.id,
        code: code.trim(),
      })
      if (verifyError) {
        surfaceMfaError(verifyError)
        return
      }
      toast({ title: t('totpEnrolled') })
      setEnrolling(null)
      setCode('')
      setFriendlyName('')
      await refreshFactors()
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
    } finally {
      setVerifyPending(false)
    }
  }

  const handleCancelEnroll = async () => {
    if (!enrolling || verifyPending) {
      return
    }
    const abandonedId = enrolling.id
    setEnrolling(null)
    setCode('')
    try {
      // Best-effort cleanup of the unverified factor — a leftover is inert
      // and shows in the list (removable there) if this fails.
      await createClient().auth.mfa.unenroll({ factorId: abandonedId })
    } catch {
      // Ignored on purpose.
    }
    await refreshFactors()
  }

  const handleRemove = async (factorId: string) => {
    if (removePending) {
      return
    }
    setRemovePending(true)
    try {
      const { error } = await createClient().auth.mfa.unenroll({ factorId })
      if (error) {
        surfaceMfaError(error)
        return
      }
      toast({ title: t('totpRemoved') })
      setConfirmingRemove(null)
      await refreshFactors()
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
    } finally {
      setRemovePending(false)
    }
  }

  const handleCopySecret = async () => {
    if (!enrolling) {
      return
    }
    try {
      await navigator.clipboard.writeText(enrolling.secret)
      toast({ title: t('totpCopied') })
    } catch {
      // Clipboard can be unavailable — the secret stays visible to copy by hand.
    }
  }

  const factorName = (factorId: string) =>
    factors?.find((factor) => factor.id === factorId)?.friendly_name || t('totpRow')

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="text-[13px] leading-[1.5] text-ink-2">{t('totpIntro')}</p>

      {loadFailed ? <p className="text-[13px] text-ink-2">{t('totpLoadError')}</p> : null}

      {factors !== null ? (
        <ul className="divide-y divide-line border border-line bg-surface">
          {factors.length === 0 ? (
            <li className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-4 py-3">
              <p className="text-[14px] text-ink">{t('totpRow')}</p>
              <Chip>{t('chipNotSet')}</Chip>
            </li>
          ) : (
            factors.map((factor) => (
              <li
                key={factor.id}
                className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
              >
                <span className="text-[14px] text-ink">{factor.friendly_name || t('totpRow')}</span>
                {factor.status === 'verified' ? (
                  <Stamp>{t('chipActive')}</Stamp>
                ) : (
                  <Chip>{t('totpChipUnverified')}</Chip>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(factor.id)}
                  className={LINK_CLASSES}
                >
                  {t('totpRemove')}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {!enrolling ? (
        <form onSubmit={handleEnroll} className="flex flex-wrap items-end gap-3">
          <Field
            label={t('totpNameLabel')}
            labelFor="totp-friendly-name"
            className="min-w-[220px] flex-1"
          >
            <input
              id="totp-friendly-name"
              name="totp-friendly-name"
              type="text"
              maxLength={50}
              placeholder={t('totpNamePlaceholder')}
              value={friendlyName}
              onChange={(event) => setFriendlyName(event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Button type="submit" variant="ghost" pending={enrollPending}>
            {t('totpAdd')}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={handleVerify}
          className="flex flex-col gap-4 border border-ink bg-surface p-4"
        >
          <MonographLabel as="h3" size="sm">
            {t('totpScanTitle')}
          </MonographLabel>
          <p className="text-[13px] leading-[1.5] text-ink-2">{t('totpScanHelp')}</p>
          <div className="flex flex-wrap items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- GoTrue returns the QR as an SVG data URI; next/image cannot consume data: sources */}
            <img
              src={enrolling.qr}
              alt={t('totpQrAlt')}
              width={160}
              height={160}
              className="h-40 w-40 border border-line bg-white"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <MonographLabel size="sm">{t('totpSecretLabel')}</MonographLabel>
              <p className="break-all font-mono text-[12px] uppercase tracking-[0.05em] text-ink">
                {enrolling.secret}
              </p>
              <button type="button" onClick={handleCopySecret} className={LINK_CLASSES}>
                {t('totpCopySecret')}
              </button>
            </div>
          </div>
          <Field label={t('totpCodeLabel')} labelFor="totp-code">
            <input
              ref={codeRef}
              id="totp-code"
              name="totp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className={fieldClass}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" pending={verifyPending}>
              {t('totpVerify')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={verifyPending}
              onClick={handleCancelEnroll}
            >
              {t('totpCancel')}
            </Button>
          </div>
        </form>
      )}

      {confirmingRemove ? (
        <div className="flex flex-col gap-4 border border-ink bg-surface p-4">
          <MonographLabel as="h3" size="sm">
            {t('totpRemoveTitle', { name: factorName(confirmingRemove) })}
          </MonographLabel>
          <p className="text-[13px] leading-[1.5] text-ink-2">{t('totpRemoveNote')}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="danger"
              pending={removePending}
              onClick={() => handleRemove(confirmingRemove)}
            >
              {t('totpConfirmRemove')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={removePending}
              onClick={() => setConfirmingRemove(null)}
            >
              {t('totpCancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {/* PRD deviation surfaced in-product: GoTrue issues no recovery codes. */}
      <p className="text-[12px] leading-[1.5] text-ink-2">{t('totpRecoveryNote')}</p>
    </div>
  )
}
