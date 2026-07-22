'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button, useToast } from '@epharmatica/ui'
import { signOutEverywhere } from '../actions'

/**
 * Sign out everywhere (wireframe 1r · hi-fi 3n · M2 §4.3): one ghost button
 * with the revokes-every-device note. On success the server action redirects
 * to /auth/sign-in?notice=signed-out (verbatim notice there), so `pending`
 * stays on while the navigation lands; only failures resolve back here.
 */
export function SignOutEverywhere() {
  const t = useTranslations('settings.sessions')
  const { toast } = useToast()
  const [pending, setPending] = useState(false)

  const handleClick = async () => {
    if (pending) {
      return
    }
    setPending(true)
    try {
      const result = await signOutEverywhere()
      if (result && !result.ok) {
        toast({ title: result.error, variant: 'error' })
        setPending(false)
      }
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
      setPending(false)
    }
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <Button variant="ghost" pending={pending} onClick={handleClick}>
        {t('signOutEverywhere')}
      </Button>
      <p className="text-[13px] leading-[1.5] text-ink-2">{t('signOutNote')}</p>
    </div>
  )
}
