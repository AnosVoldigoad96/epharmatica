import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { StackedRecord } from '@epharmatica/ui'

/*
 * /contact — the four mailboxes as a stacked monograph record, one sentence
 * each. jobs@ doubles as the interim employer intake (PRD v1.7 M6-2).
 */

const MAILBOX_KEYS = ['support', 'jobs', 'legal', 'privacy'] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.contact')
  return { title: t('title'), description: t('description') }
}

export default async function ContactPage() {
  const t = await getTranslations('legal.contact')

  const rows = MAILBOX_KEYS.map((key) => ({
    label: t(`rows.${key}.label`),
    value: (
      <div className="flex flex-col gap-0.5">
        <a
          href={`mailto:${t(`rows.${key}.email`)}`}
          className="self-start font-mono text-[13px] text-ink underline decoration-primary decoration-1 underline-offset-4 hover:decoration-2"
        >
          {t(`rows.${key}.email`)}
        </a>
        <span className="text-[13px] text-ink-2">{t(`rows.${key}.note`)}</span>
      </div>
    ),
  }))

  return (
    <div className="mx-auto w-full max-w-content px-5 sm:px-6 md:px-8">
      <div className="mx-auto flex w-full max-w-reading flex-col gap-6 py-10 md:py-14">
        <header className="flex flex-col gap-4">
          <h1 className="font-display text-[clamp(25px,1.5rem+1.6vw,32px)] font-bold leading-[1.15] tracking-[-0.01em]">
            {t('title')}
          </h1>
          <p className="text-ink-2">{t('intro')}</p>
        </header>
        <StackedRecord rows={rows} />
      </div>
    </div>
  )
}
