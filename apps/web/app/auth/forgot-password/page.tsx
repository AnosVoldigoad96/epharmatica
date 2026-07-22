import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form'

/*
 * /auth/forgot-password (M2 §4.3 · securities.md §10): email + Turnstile +
 * one verb; the result line never reveals whether the account exists. No
 * frame exists in either canvas (flagged gap) — the composition follows the
 * auth-card pattern of the drawn screens.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta.forgotPassword')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations('auth.forgotPassword')

  return (
    <div>
      <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">{t('title')}</h1>
      <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-2">{t('explainer')}</p>
      <div className="mt-5">
        <ForgotPasswordForm turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </div>
      <p className="mt-5 text-[13px]">
        <Link
          href="/auth/sign-in"
          className="text-ink underline decoration-primary decoration-1 underline-offset-2 hover:decoration-2"
        >
          {t('backToSignIn')}
        </Link>
      </p>
    </div>
  )
}
