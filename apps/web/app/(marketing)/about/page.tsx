import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { MonographLabel, StackedRecord } from '@epharmatica/ui'

/*
 * /about — what ePharmatica is (one accurate paragraph from PRD §1), the six
 * modules as a stacked monograph record, and the content-review promise
 * (external licensed reviewer, no self-approval — PRD G6/v1.7 Q2).
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.about')
  return { title: t('title'), description: t('description') }
}

export default async function AboutPage() {
  const t = await getTranslations('legal.about')
  const tFeatures = await getTranslations('landing.features')

  const moduleRows = (
    ['learning', 'aiStudyTools', 'community', 'blog', 'jobs', 'resume'] as const
  ).map((key) => ({
    label: tFeatures(`${key}.title`),
    value: tFeatures(`${key}.body`),
  }))

  return (
    <div className="mx-auto w-full max-w-content px-5 sm:px-6 md:px-8">
      <div className="mx-auto flex w-full max-w-reading flex-col gap-8 py-10 md:py-14">
        <header className="flex flex-col gap-4">
          <h1 className="font-display text-[clamp(25px,1.5rem+1.6vw,32px)] font-bold leading-[1.15] tracking-[-0.01em]">
            {t('title')}
          </h1>
          <p className="text-ink-2">{t('intro')}</p>
        </header>

        <section className="flex flex-col gap-4">
          <MonographLabel as="h2" rule="hard">
            {t('modulesLabel')}
          </MonographLabel>
          <StackedRecord rows={moduleRows} />
        </section>

        <section className="flex flex-col gap-3">
          <MonographLabel as="h2" rule="hard">
            {t('reviewLabel')}
          </MonographLabel>
          <p className="text-ink-2">{t('review')}</p>
        </section>
      </div>
    </div>
  )
}
