'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MonographLabel } from '@epharmatica/ui'

/**
 * Settings rail (canvas .snav · wireframes §5): SETTINGS mono heading + the
 * five links in fixed order. Active item: primary text on primary-tint with
 * the 2px primary start border (logical `border-s-2`). Below md the rail
 * becomes a horizontal scrollable tab row above the content (the canvases
 * draw no mobile collapse — deliberate minimal design).
 */
const LINKS = [
  { key: 'profile', href: '/settings/profile' },
  { key: 'appearance', href: '/settings/appearance' },
  { key: 'aiKeys', href: '/settings/ai-keys' },
  { key: 'data', href: '/settings/data' },
  { key: 'sessions', href: '/settings/sessions' },
] as const

export function SettingsNav() {
  const t = useTranslations('settings.nav')
  const pathname = usePathname()

  return (
    <nav
      aria-label={t('heading')}
      className="border-b border-line md:border-b-0 md:border-e md:border-ink md:pb-10 md:pt-7"
    >
      <MonographLabel as="div" className="mb-3 hidden md:block md:ps-3">
        {t('heading')}
      </MonographLabel>
      <ul className="flex overflow-x-auto md:flex-col md:overflow-visible">
        {LINKS.map((link) => {
          const active = pathname === link.href
          return (
            <li key={link.key} className="flex-none">
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center whitespace-nowrap border-s-2 px-3 py-2 text-[13.5px] [@media(pointer:coarse)]:min-h-11 ${
                  active
                    ? 'border-primary bg-primary-tint font-medium text-primary'
                    : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {t(link.key)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
