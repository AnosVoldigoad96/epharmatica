import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MfaChallengeForm } from '@/features/auth/components/mfa-challenge-form'
import { sanitizeNextPath } from '@/lib/auth/redirect'

/*
 * /auth/mfa — the TOTP step-up (M4-5): reached when a session holds a
 * verified factor it has not yet passed. The client form challenges +
 * verifies against the browser client (cookie updates ride @supabase/ssr)
 * and continues to `next`. Sessions without a pending factor pass through;
 * no session bounces to sign-in (handled in the form's factor load).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.mfa')
  return { title: t('title'), robots: { index: false } }
}

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations('auth.mfa')
  const params = await searchParams
  const next = sanitizeNextPath(typeof params.next === 'string' ? params.next : null)

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">{t('title')}</h1>
      <div className="mt-4">
        <MfaChallengeForm next={next} />
      </div>
    </div>
  )
}
