import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { BrandMark, BrandWordmark } from '@/app/(marketing)/_components/brand-mark'
import { HeaderAuthMenu } from '@/features/account/components/header-auth-menu'

/*
 * (learn) chrome (1.C · reader spec): the marketing header pattern minus the
 * footer — logo + wordmark, the Learn nav link (active: primary + 2px
 * underline; the other modules don't exist yet, so only Learn renders),
 * spacer, HeaderAuthMenu. Static-friendly on purpose: no session/cookie
 * reads here — HeaderAuthMenu swaps in the avatar menu client-side, so the
 * /learn pages stay ISR shells.
 */
export default async function LearnLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('learn.nav')
  const tCta = await getTranslations('landing.nav')
  const tMenu = await getTranslations('common.accountMenu')

  return (
    <>
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-ink bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-content items-center gap-5 px-5 sm:px-6 md:h-16 md:gap-7 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={24} />
            <BrandWordmark />
          </Link>
          <nav
            aria-label={t('primary')}
            className="flex items-center gap-[22px] text-[14px] font-medium"
          >
            <Link
              href="/learn"
              aria-current="true"
              className="border-b-2 border-primary pb-0.5 pt-1 text-primary"
            >
              {t('learn')}
            </Link>
          </nav>
          <span className="flex-1" />
          <HeaderAuthMenu
            labels={{
              joinWaitlist: tCta('joinWaitlist'),
              menuAria: tMenu('menuAria'),
              admin: tMenu('admin'),
              settings: tMenu('settings'),
              signOut: tMenu('signOut'),
            }}
          />
        </div>
      </header>

      <main>{children}</main>
    </>
  )
}
