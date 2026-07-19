'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

/**
 * Route-group error boundary (ARCHITECTURE §7) — empty-state pattern per
 * STYLE.md: monograph label above a 1px rule, one sentence, verb-first
 * actions. Square, both themes.
 */
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors.appError')

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <div className="w-full max-w-md">
        <p className="border-b border-line pb-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-2">
          {t('label')}
        </p>
        <p className="mt-4">{t('message')}</p>
        <div className="mt-6 flex items-center gap-5">
          <button
            type="button"
            onClick={reset}
            className="border border-line bg-surface px-4 py-2 text-sm hover:border-primary"
          >
            {t('tryAgain')}
          </button>
          <Link href="/" className="text-primary underline underline-offset-2">
            {t('goHome')}
          </Link>
        </div>
      </div>
    </main>
  )
}
