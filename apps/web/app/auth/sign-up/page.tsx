import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SignUpForm } from '@/features/auth/components/sign-up-form'
import { sanitizeNextPath } from '@/lib/auth/redirect'

/*
 * /auth/sign-up (wireframe 1m · hi-fi 3i · M2 §4.1). The page only threads
 * the sanitized `next` and the Turnstile site key into the client form —
 * composition lives in features/auth/components/sign-up-form.tsx. Reading
 * searchParams makes the page dynamic; that's expected for auth surfaces.
 */
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta.signUp')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const next = sanitizeNextPath(typeof params.next === 'string' ? params.next : null)

  return <SignUpForm next={next} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
}
