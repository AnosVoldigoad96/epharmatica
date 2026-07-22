import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { OauthCompleteForm } from '@/features/auth/components/oauth-complete-form'
import { withNext } from '@/features/auth/next-param'
import { sanitizeNextPath } from '@/lib/auth/redirect'
import { createClient } from '@/lib/supabase/server'

/*
 * /auth/complete (wireframe 1n · hi-fi 3j · M2 §4.2): the mandatory OAuth
 * first-time completion step. Requires a session (else sign-in); redirects
 * away when a profile already exists (the step is done exactly once). A
 * Google user who abandons this page keeps the resumable pending state —
 * auth user without profile — and the completion gate routes them back here.
 */
export const dynamic = 'force-dynamic'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta.complete')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function CompletePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const next = sanitizeNextPath(typeof params.next === 'string' ? params.next : null)

  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    supabase = await createClient()
  } catch {
    // Supabase env unset (dev without a stack) — nothing to complete.
    redirect(withNext('/auth/sign-in', next))
  }

  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) {
    redirect(withNext('/auth/sign-in', next))
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profile) {
    redirect(next)
  }

  return <OauthCompleteForm email={userData.user.email ?? ''} next={next} />
}
