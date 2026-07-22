import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MonographLabel } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'

/*
 * /settings/ai-keys (wireframe 1v · hi-fi 3r · dev-plan 1.A): honest shell
 * only — the bring-your-own-key manager ships with the AI study suite (M3).
 * A COMING SOON chip + one explainer panel, no fake controls (PLAN: "keep
 * honest, no fake UI").
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.meta.aiKeys')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function AiKeysSettingsPage() {
  const t = await getTranslations('settings.aiKeys')

  return (
    <div>
      <MonographLabel as="h2" rule="hard">
        {t('sectionLabel')}
      </MonographLabel>
      <div className="mt-5 border border-line bg-surface p-5">
        <Chip>{t('comingSoonChip')}</Chip>
        <p className="mt-3 text-[13.5px] leading-[1.6] text-ink-2">{t('body')}</p>
      </div>
    </div>
  )
}
