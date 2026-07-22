'use client'

import { useTranslations } from 'next-intl'
import { strengthLabelKey, type PasswordScore } from '@/lib/security/password-strength'

/**
 * The password-helper hint with the styled strength word (hi-fi 3i: the
 * label sits inside the sentence in primary-strong, weight 500 — danger when
 * too weak). ICU arguments can't carry JSX in next-intl, so the caller
 * formats the message with STRENGTH_SENTINEL as the value and this splits
 * around it — locale-safe whatever surrounds the placeholder.
 */
export const STRENGTH_SENTINEL = '@STRENGTH@'

export function StrengthHint({
  template,
  score,
}: {
  template: string
  score: PasswordScore | null
}) {
  const t = useTranslations('auth.signUp')
  const key = score === null ? 'unknown' : strengthLabelKey(score)
  const [before = '', after = ''] = template.split(STRENGTH_SENTINEL)

  return (
    <>
      {before}
      <span
        className={
          key === 'unknown'
            ? undefined
            : key === 'tooWeak'
              ? 'font-medium text-danger'
              : 'font-medium text-primary-strong'
        }
      >
        {t(`strength.${key}`)}
      </span>
      {after}
    </>
  )
}
