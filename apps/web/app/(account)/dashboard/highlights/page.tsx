import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getMyHighlights } from '@/features/study/dashboard-queries'
import { HighlightsLibrary } from '../_components/highlights-library'

/*
 * /dashboard/highlights — "My Highlights" (dev-plan §1.D · M1 §5.5): the
 * full library, grouped subject › unit against the published tree, with
 * orphans pinned first (their snapshots survive every reorganization —
 * restore happens in-reader via the drawer). Dynamic via the (account)
 * layout; ONE server fan-out (getMyHighlights), interactions client-side.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('account.meta.highlights')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function MyHighlightsPage() {
  const t = await getTranslations('account.highlights')
  const data = await getMyHighlights()
  // The (account) layout redirects signed-out visitors before this renders.
  if (!data) return null

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-5 py-8 sm:px-6 md:px-8 md:py-10">
      <div>
        <Link
          href="/dashboard"
          className="mb-3 inline-block font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-ink-2 underline underline-offset-2 hover:text-primary"
        >
          ← {t('backToDashboard')}
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em]">
            {t('title')}
          </h1>
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-2">
            {t('counter', { count: data.total })}
          </span>
        </div>
      </div>

      <HighlightsLibrary data={data} />
    </div>
  )
}
