import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import {
  getSiteSettings,
  listAiModels,
  listFlags,
  listPersonalDataRegistry,
  listReservedUsernames,
} from '@/features/admin-settings/queries'
import { SettingsPanels } from './_components/settings-panels'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.settings')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/*
 * Settings (M4 §8 · dev-plan 1.B): stacked panels — feature flags (audited
 * flips, `flags` tag bust), the ai_models registry editor (M3 §4.1), site
 * metadata, the reserved-usernames list editor (M2 §4.4), and the
 * read-only personal-data registry viewer (M2 R-M2b).
 */
export default async function AdminSettingsPage() {
  await requireSection('settings')
  const t = await getTranslations('admin.settings')
  const tNav = await getTranslations('admin.nav')

  const [flags, models, site, reserved, registry] = await Promise.all([
    listFlags(),
    listAiModels(),
    getSiteSettings(),
    listReservedUsernames(),
    listPersonalDataRegistry(),
  ])

  return (
    <div className="max-w-5xl">
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
        {tNav('settings')}
      </p>
      <SettingsPanels
        heading={t('title')}
        flags={flags}
        models={models}
        site={site}
        reserved={reserved}
        registry={registry}
      />
    </div>
  )
}
