'use client'

import { useTranslations } from 'next-intl'
import type { UsernameAvailability } from './use-username-availability'

/**
 * The inline availability status for the Field trailing slot (wireframes
 * §1/§3): mono 11px CHECKING… / ✓ AVAILABLE (primary-strong) / ✗ TAKEN
 * (danger). Status strings live under auth.signUp.* — the completion form
 * reuses them. Render nothing while idle (callers pass null instead).
 */
export function UsernameStatus({ state }: { state: UsernameAvailability }) {
  const t = useTranslations('auth.signUp')
  if (state === 'idle') {
    return null
  }
  if (state === 'checking') {
    return <span role="status">{t('usernameChecking')}</span>
  }
  return (
    <span role="status" className={state === 'available' ? 'text-primary-strong' : 'text-danger'}>
      {state === 'available' ? t('usernameAvailable') : t('usernameTaken')}
    </span>
  )
}
