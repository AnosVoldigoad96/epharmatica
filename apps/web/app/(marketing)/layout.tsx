import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { MonographLabel } from '@epharmatica/ui'
import { BrandMark, BrandWordmark } from './_components/brand-mark'
import { HeaderAuthMenu } from '@/features/account/components/header-auth-menu'

/*
 * Marketing shell per mockup 2a: sticky topnav (56px mobile / 64px desktop,
 * hard ink bottom rule, opaque paper — no scroll shadow, STYLE §5) + monograph
 * footer with a hard ink top rule. Content centers at the 1200px container
 * with 20/24/32 gutters (S2–S3).
 *
 * Deliberate deviations from mockup 2a (noted for review):
 * - "Sign in" → primary sm "Join waitlist" → /#waitlist (auth ships Phase 1).
 * - The ⌘K searchbox is omitted (search ships with the reader, Phase 1).
 * - Nav links point at landing section anchors — the module routes don't
 *   exist yet; below md the link row is hidden and the Join waitlist CTA
 *   carries the bar (no JS menu).
 */

const NAV_LINKS = [
  { key: 'learn', href: '/#learning' },
  { key: 'community', href: '/#community' },
  { key: 'blog', href: '/#blog' },
  { key: 'jobs', href: '/#jobs' },
  { key: 'resume', href: '/#resume' },
] as const

// Order per mockup 2a's footer line: ABOUT · CONTACT · PRIVACY · TERMS ·
// CONTENT POLICY · MEDICAL DISCLAIMER. The mailboxes live on /contact.
const LEGAL_LINKS = [
  { key: 'about', href: '/about' },
  { key: 'contact', href: '/contact' },
  { key: 'privacy', href: '/privacy' },
  { key: 'terms', href: '/terms' },
  { key: 'contentPolicy', href: '/content-policy' },
  { key: 'medicalDisclaimer', href: '/medical-disclaimer' },
] as const

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const tNav = await getTranslations('landing.nav')
  const tMenu = await getTranslations('common.accountMenu')
  const tFooter = await getTranslations('footer')
  const year = new Date().getFullYear()

  return (
    <>
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-ink bg-paper">
        <div className="mx-auto flex h-14 w-full max-w-content items-center gap-5 px-5 sm:px-6 md:h-16 md:gap-7 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={24} />
            <BrandWordmark />
          </Link>
          <nav
            aria-label={tNav('primary')}
            className="hidden items-center gap-[22px] text-[14px] font-medium md:flex"
          >
            {NAV_LINKS.map((link) => (
              <Link key={link.key} href={link.href} className="py-1 text-ink hover:text-primary">
                {tNav(link.key)}
              </Link>
            ))}
          </nav>
          <span className="flex-1" />
          <HeaderAuthMenu
            labels={{
              joinWaitlist: tNav('joinWaitlist'),
              menuAria: tMenu('menuAria'),
              admin: tMenu('admin'),
              settings: tMenu('settings'),
              signOut: tMenu('signOut'),
            }}
          />
        </div>
      </header>

      <main>{children}</main>

      {/* Footer per mockup 2a: one row — mark + © left, mono link line end.
          Stacks below md; each link keeps a comfortable hit area. */}
      <footer className="border-t border-ink">
        <div className="mx-auto flex w-full max-w-content flex-col gap-4 px-5 py-5 sm:px-6 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark size={16} />
            <MonographLabel size="sm" as="div">
              {tFooter('copyright', { year })}
            </MonographLabel>
          </div>

          <nav aria-label={tFooter('legalLabel')}>
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {LEGAL_LINKS.map((link, i) => (
                <li key={link.key} className="flex items-center gap-2">
                  {i > 0 ? (
                    <span aria-hidden className="font-mono text-[10px] text-ink-2">
                      ·
                    </span>
                  ) : null}
                  <Link
                    href={link.href}
                    className="py-2 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-2 hover:text-primary"
                  >
                    {tFooter(`links.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </>
  )
}
