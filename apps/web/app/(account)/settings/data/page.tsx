import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Button, MonographLabel } from '@epharmatica/ui'

/*
 * /settings/data (wireframe 1q · hi-fi 3m · M2 §4.7): the 1.A page shell —
 * PRD hook #4. Export panel with its disabled ghost button + mono footnote,
 * the DELETE ACCOUNT hard label in danger over the grace-period explainer,
 * and the honest "arrives later in Phase 1" line. No interactive controls
 * until the export limiter and the 14-day deletion machine land (1.F).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.meta.data')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function DataSettingsPage() {
  const t = await getTranslations('settings.data')

  return (
    <div className="flex flex-col gap-8">
      <section>
        <MonographLabel as="h2" rule="hard">
          {t('exportLabel')}
        </MonographLabel>
        <div className="mt-5 flex flex-col gap-4 border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">{t('exportTitle')}</p>
            <p className="mt-1 text-[13px] leading-[1.5] text-ink-2">{t('exportSub')}</p>
          </div>
          <Button variant="ghost" size="sm" disabled className="flex-none self-start sm:self-auto">
            {t('exportButton')}
          </Button>
        </div>
        <MonographLabel size="sm" as="div" className="mt-3">
          {t('exportNote')}
        </MonographLabel>
      </section>

      <section>
        <MonographLabel as="h2" rule="hard" className="border-danger text-danger">
          {t('deleteLabel')}
        </MonographLabel>
        <div className="mt-5 border border-danger bg-surface p-5">
          <p className="text-[13.5px] leading-[1.6] text-ink">{t('deleteBody')}</p>
        </div>
      </section>

      <p className="text-[13px] text-ink-2">{t('comingSoon')}</p>
    </div>
  )
}
