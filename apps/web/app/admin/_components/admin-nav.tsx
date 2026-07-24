'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MonographLabel } from '@epharmatica/ui'
import type { StaffRole } from '@/features/admin/permissions'
import { sectionsForRole } from '@/features/admin/permissions'

/**
 * Admin left nav (M4 §4): Dashboard · Content · Media · Users · Settings ·
 * Audit, filtered to the sections the role may enter. Later-phase groups
 * (Blog, Community, Jobs, Verifications, WhatsApp) register their entries
 * behind their module flags per the §10 shell contracts. Same rail
 * mechanics as the settings nav: active = primary on tint with the 2px
 * logical start border; horizontal scroll row below md.
 */
export function AdminNav({ role }: { role: StaffRole }) {
  const t = useTranslations('admin.nav')
  const pathname = usePathname()
  const sections = sectionsForRole(role)

  return (
    <nav
      aria-label={t('heading')}
      className="border-b border-line md:border-b-0 md:border-e md:border-ink md:pb-10 md:pt-7"
    >
      <MonographLabel as="div" className="mb-3 hidden md:block md:ps-3">
        {t('heading')}
      </MonographLabel>
      <ul className="flex overflow-x-auto md:flex-col md:overflow-visible">
        {sections.map((section) => {
          const active =
            section.href === '/admin'
              ? pathname === '/admin'
              : pathname === section.href || pathname.startsWith(`${section.href}/`)
          return (
            <li key={section.key} className="flex-none">
              <Link
                href={section.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-8 items-center whitespace-nowrap border-s-2 px-3 py-1.5 text-[13px] [@media(pointer:coarse)]:min-h-11 ${
                  active
                    ? 'border-primary bg-primary-tint font-medium text-primary'
                    : 'border-transparent text-ink-2 hover:text-ink'
                }`}
              >
                {t(section.key)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
