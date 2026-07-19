import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

/**
 * 404 — empty-state pattern per STYLE.md: monograph label above a 1px rule,
 * one sentence, one underlined action link home. Square, both themes.
 */
export default async function NotFound() {
  const t = await getTranslations('errors.notFound')

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md">
        <p className="border-b border-line pb-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-2">
          {t('label')}
        </p>
        <p className="mt-4">{t('message')}</p>
        <p className="mt-6">
          <Link href="/" className="text-primary underline underline-offset-2">
            {t('goHome')}
          </Link>
        </p>
      </div>
    </main>
  )
}
