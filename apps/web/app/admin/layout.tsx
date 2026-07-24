import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { fromStoredPrefs } from '@epharmatica/database'
import { MonographLabel, ToastProvider } from '@epharmatica/ui'
import { ThemeSync } from '@/features/account/components/theme-sync'
import { getAdminProfile } from '@/features/admin/queries'
import { mfaStepUpRequired } from '@/lib/auth/mfa'
import { AdminNav } from './_components/admin-nav'

/*
 * /admin shell (M4 §4 · dev-plan 1.B). Layer 2 of the three-layer gate:
 * the proxy already turned non-staff away; this layout re-checks on every
 * render (rows can change under a live session) and hands the role to the
 * nav, which shows only permitted sections. Compact density is the admin
 * default (STYLE §5.3) — signalled via data-density for components to
 * adopt; touch devices keep comfortable sizing (never compact on touch).
 * A colored banner marks staging; all admin routes send noindex.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await getAdminProfile()
  if (!profile) {
    redirect('/')
  }

  // AAL step-up (M4-5): a session with a verified-but-unpassed factor must
  // clear the TOTP challenge before any admin surface renders.
  if (await mfaStepUpRequired()) {
    const requested = (await headers()).get('x-pathname') ?? '/admin'
    redirect(`/auth/mfa?next=${encodeURIComponent(requested)}`)
  }

  const t = await getTranslations('admin.shell')
  const prefs = fromStoredPrefs(profile.prefs)
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging'

  return (
    <ToastProvider>
      <ThemeSync theme={prefs.theme} />
      {isStaging ? (
        <div className="border-b border-warn bg-warn/15 px-5 py-1.5">
          <MonographLabel as="span">{t('stagingBanner')}</MonographLabel>
        </div>
      ) : null}
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-ink bg-paper">
        <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between gap-4 px-5">
          <div className="flex items-baseline gap-3">
            <Link href="/admin" className="hover:text-primary">
              <MonographLabel as="span">{t('title')}</MonographLabel>
            </Link>
            <span className="text-[13px] text-ink-2">{profile.display_name}</span>
            <span className="bg-primary-tint px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-primary">
              {profile.role}
            </span>
          </div>
          <Link href="/" className="text-[13px] text-ink-2 underline hover:text-ink">
            {t('backToSite')}
          </Link>
        </div>
      </header>
      <div
        data-density="compact"
        className="mx-auto grid max-w-[1440px] grid-cols-1 gap-0 px-5 md:grid-cols-[200px_1fr]"
      >
        <AdminNav role={profile.role} />
        <main className="min-w-0 pb-16 pt-6 md:ps-8">{children}</main>
      </div>
    </ToastProvider>
  )
}
