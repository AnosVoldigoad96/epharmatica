import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { fromStoredPrefs } from '@epharmatica/database'
import { MonographLabel } from '@epharmatica/ui'
import { AppearanceForm } from '@/features/account/components/appearance-form'
import { getOwnProfile } from '@/features/account/queries'

/*
 * /settings/appearance (wireframe 1p · hi-fi 3l · M2 §4.6): APPEARANCE hard
 * label over the theme + reader-text controls. The PRD IA gives appearance
 * its own page (the hi-fi's merged profile+appearance frame doesn't carry
 * over — PLAN decision). Prefs are read leniently: any legacy/invalid jsonb
 * falls back to defaults.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.meta.appearance')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function AppearanceSettingsPage() {
  const t = await getTranslations('settings.appearance')

  const profile = await getOwnProfile()
  if (!profile) {
    redirect('/auth/complete?next=%2Fsettings%2Fappearance')
  }

  return (
    <div>
      <MonographLabel as="h2" rule="hard">
        {t('sectionLabel')}
      </MonographLabel>
      <AppearanceForm initial={fromStoredPrefs(profile.prefs)} />
    </div>
  )
}
