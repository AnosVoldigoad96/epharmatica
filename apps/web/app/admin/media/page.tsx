import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { requireSection } from '@/features/admin/queries'
import { getStaffDirectory } from '@/features/content/queries'
import { getAssetUsage, listMediaAssets } from '@/features/media/queries'
import { MediaLibrary } from './_components/media-library'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.media')
  return { title: t('title'), robots: { index: false, follow: false } }
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/*
 * Media library (M4-3 §6 · dev-plan 1.B): global, first-class assets —
 * toolbar (search / uploader / unused / deleted) + thumbnail grid + a
 * detail pane with usage. Filters and the selected asset live in the URL,
 * so every change re-queries on the server under RLS (trigram search,
 * staff read of soft-deleted rows).
 */
export default async function AdminMediaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireSection('media')
  const t = await getTranslations('admin.media')
  const tNav = await getTranslations('admin.nav')
  const params = await searchParams

  const filters = {
    search: str(params.q)?.trim() ?? '',
    uploader: str(params.uploader) ?? '',
    unusedOnly: str(params.unused) === '1',
    showDeleted: str(params.deleted) === '1',
  }

  const [assets, staff] = await Promise.all([
    listMediaAssets({
      search: filters.search || undefined,
      uploader: filters.uploader || undefined,
      unusedOnly: filters.unusedOnly,
      includeDeleted: filters.showDeleted,
    }),
    getStaffDirectory(),
  ])

  const selectedId = str(params.asset)
  const selected = selectedId ? (assets.find((asset) => asset.id === selectedId) ?? null) : null
  const usage = selected ? await getAssetUsage(selected.id) : []

  const uploaders = [...staff.values()]
    .map((entry) => ({ id: entry.id, username: entry.username }))
    .sort((a, b) => a.username.localeCompare(b.username))

  return (
    <div className="max-w-5xl">
      <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
        {tNav('media')}
      </p>
      <MediaLibrary
        heading={t('title')}
        assets={assets}
        selected={selected}
        usage={usage}
        uploaders={uploaders}
        filters={filters}
      />
    </div>
  )
}
