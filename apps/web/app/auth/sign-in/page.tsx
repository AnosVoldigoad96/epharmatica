import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { sanitizeNextPath } from '@/lib/auth/redirect'

/*
 * /auth/sign-in (wireframe 1o · hi-fi 3k · M2 §4.3). Notices from search
 * params render above the form as a callout: `notice=signed-out` (verbatim
 * signed-out-everywhere), `notice=link-blocked` (verbatim auto-link-blocked),
 * `error=link` (expired/invalid link), `verified=1` (email verified).
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>

const NOTICE_TONES = {
  info: 'border-primary bg-primary-tint',
  warn: 'border-warn bg-paper',
  danger: 'border-danger bg-paper',
} as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta.signIn')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('auth.signIn')
  const params = await searchParams
  const next = sanitizeNextPath(typeof params.next === 'string' ? params.next : null)
  const noticeParam = typeof params.notice === 'string' ? params.notice : null
  const errorParam = typeof params.error === 'string' ? params.error : null
  const verifiedParam = typeof params.verified === 'string' ? params.verified : null

  let notice: { text: string; tone: keyof typeof NOTICE_TONES } | null = null
  if (noticeParam === 'signed-out') {
    notice = { text: t('notices.signedOut'), tone: 'info' }
  } else if (noticeParam === 'link-blocked') {
    notice = { text: t('notices.linkBlocked'), tone: 'warn' }
  } else if (errorParam === 'link') {
    notice = { text: t('notices.linkError'), tone: 'danger' }
  } else if (verifiedParam === '1') {
    notice = { text: t('notices.verified'), tone: 'info' }
  }

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">{t('title')}</h1>
      {notice ? (
        <p
          role="status"
          className={`mt-4 border-s-2 px-3.5 py-2.5 text-[13px] leading-[1.5] ${NOTICE_TONES[notice.tone]}`}
        >
          {notice.text}
        </p>
      ) : null}
      <SignInForm next={next} />
    </div>
  )
}
