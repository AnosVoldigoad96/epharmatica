'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, MonographLabel, useToast } from '@epharmatica/ui'
import { resendVerification } from '@/features/auth/actions'

/**
 * Verify-email banner (wireframes §4 — the annotated-only banner, designed
 * here): a warn strip under the topnav while `email_confirmed_at` is null.
 * Mono label + one sentence + a ghost Resend button (the action is
 * rate-limited and non-enumerating server-side). Warn styling follows the
 * marketing Chip precedent: warn border/fill alpha, ink text (§15 AA floor).
 */
export function VerifyEmailBanner() {
  const t = useTranslations('settings.banner')
  const tErrors = useTranslations('auth.errors')
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const handleResend = async () => {
    if (pending) {
      return
    }
    setPending(true)
    try {
      const result = await resendVerification()
      if (result.ok) {
        toast({ title: t('resent') })
      } else {
        toast({ title: result.error, variant: 'error' })
      }
    } catch {
      toast({ title: tErrors('generic'), variant: 'error' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="border-b border-warn/40 bg-warn/10">
      <div className="mx-auto flex w-full max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5 sm:px-6 md:px-8">
        <MonographLabel size="sm" as="div" className="text-ink">
          {t('label')}
        </MonographLabel>
        <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-ink">{t('message')}</p>
        <Button variant="ghost" size="sm" pending={pending} onClick={handleResend}>
          {t('resend')}
        </Button>
      </div>
    </div>
  )
}
