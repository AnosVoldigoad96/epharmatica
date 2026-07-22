import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form'
import { sanitizeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

/*
 * /auth/reset-password (M2 §4.3): requires the recovery session minted by
 * the callback route — arriving without one (expired link, direct visit)
 * lands on /auth/forgot-password to request a fresh link. No frame exists
 * in either canvas (flagged gap) — auth-card pattern, one field, one verb.
 */
export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta.resetPassword')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getTranslations('auth.resetPassword')
  const params = await searchParams
  const next = sanitizeNextPath(typeof params.next === 'string' ? params.next : null)

  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    supabase = await createClient()
  } catch {
    // Supabase env unset (dev without a stack) — no recovery session exists.
    redirect('/auth/forgot-password')
  }

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    redirect('/auth/forgot-password')
  }

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">{t('title')}</h1>
      <div className="mt-5">
        <ResetPasswordForm next={next} email={userData.user.email ?? undefined} />
      </div>
    </div>
  )
}
