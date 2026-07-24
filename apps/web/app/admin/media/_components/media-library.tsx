'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import {
  replaceMediaAsset,
  restoreMediaAsset,
  softDeleteMediaAsset,
  uploadMediaAsset,
} from '@/features/media/actions'
import type { AssetUsageEntry, MediaAssetSummary } from '@/features/media/queries'
import { AdminSheet } from '../../content/_components/admin-sheet'

/**
 * Media library surface (M4-3 §6 · hi-fi 3aj conventions): toolbar
 * (search · uploader · unused/deleted toggles · Upload), ~160px square
 * thumbnail grid (deleted assets dimmed with a chip), and a detail side
 * pane — full preview, mono path, dimensions × bytes, uploader, tags,
 * the usage list ("Used in N subtopics", draft uses marked), Replace /
 * Delete (blocked-with-reason while used) / Restore. Filters and the
 * selection live in the URL — every change re-queries on the server.
 */

type Filters = {
  search: string
  uploader: string
  unusedOnly: boolean
  showDeleted: boolean
}

type MediaLibraryProps = {
  heading: string
  assets: MediaAssetSummary[]
  selected: MediaAssetSummary | null
  usage: AssetUsageEntry[]
  uploaders: { id: string; username: string }[]
  filters: Filters
}

function filename(path: string): string {
  return path.split('/').pop() ?? path
}

function formatKilobytes(bytes: number): number {
  return Math.max(1, Math.round(bytes / 1024))
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
}

export function MediaLibrary({
  heading,
  assets,
  selected,
  usage,
  uploaders,
  filters,
}: MediaLibraryProps) {
  const t = useTranslations('admin.media')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState(filters.search)
  const [uploadOpen, setUploadOpen] = useState(false)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  /** Push the merged filter/selection state into the URL (server re-query). */
  const apply = (next: Partial<Filters> & { asset?: string | null }) => {
    const merged = {
      ...filters,
      search,
      asset: selected?.id ?? null,
      ...next,
    }
    const params = new URLSearchParams()
    if (merged.search) params.set('q', merged.search)
    if (merged.uploader) params.set('uploader', merged.uploader)
    if (merged.unusedOnly) params.set('unused', '1')
    if (merged.showDeleted) params.set('deleted', '1')
    if (merged.asset) params.set('asset', merged.asset)
    const query = params.toString()
    router.replace(query ? `/admin/media?${query}` : '/admin/media', { scroll: false })
  }

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, doneTitle: string) => {
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        toast({ title: result.error ?? '', variant: 'error' })
        return
      }
      toast({ title: doneTitle })
      router.refresh()
    })
  }

  const onReplacePicked = (file: File | undefined) => {
    if (!selected || !file) return
    const formData = new FormData()
    formData.set('file', file)
    run(() => replaceMediaAsset(selected.id, formData), t('toasts.replaced'))
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="flex-1 font-display text-[19px] font-bold">{heading}</h1>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          {t('toolbar.upload')}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2.5">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            apply({ search })
          }}
          className="flex items-center gap-2"
        >
          <MonographLabel as="label" htmlFor="media-search" size="sm">
            {t('toolbar.searchLabel')}
          </MonographLabel>
          <input
            id="media-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onBlur={() => {
              if (search !== filters.search) apply({ search })
            }}
            placeholder={t('toolbar.searchPlaceholder')}
            className="h-8 w-52 border border-line bg-surface px-2 text-[13px] text-ink placeholder:text-ink-2"
          />
        </form>

        <label className="flex items-center gap-2">
          <MonographLabel as="span" size="sm">
            {t('toolbar.uploaderLabel')}
          </MonographLabel>
          <select
            value={filters.uploader}
            onChange={(event) => apply({ uploader: event.target.value })}
            className="h-8 border border-line bg-surface px-2 text-[13px] text-ink"
          >
            <option value="">{t('toolbar.allUploaders')}</option>
            {uploaders.map((uploader) => (
              <option key={uploader.id} value={uploader.id}>
                {uploader.username}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-[12.5px] text-ink">
          <input
            type="checkbox"
            checked={filters.unusedOnly}
            onChange={(event) => apply({ unusedOnly: event.target.checked })}
            className="size-3.5 accent-primary"
          />
          {t('toolbar.unusedOnly')}
        </label>

        <label className="flex items-center gap-2 text-[12.5px] text-ink">
          <input
            type="checkbox"
            checked={filters.showDeleted}
            onChange={(event) => apply({ showDeleted: event.target.checked })}
            className="size-3.5 accent-primary"
          />
          {t('toolbar.showDeleted')}
        </label>
      </div>

      {assets.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-center">
          <MonographLabel as="div" size="sm" className="mb-2">
            {t('grid.emptyLabel')}
          </MonographLabel>
          <p className="text-[13px] text-ink-2">{t('grid.emptyBody')}</p>
        </div>
      ) : (
        <div className={selected ? 'grid items-start gap-6 lg:grid-cols-[1fr_320px]' : ''}>
          <ul
            aria-label={t('grid.label')}
            className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3"
          >
            {assets.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => apply({ asset: asset.id })}
                  aria-pressed={selected?.id === asset.id}
                  className={`block w-full border bg-surface p-2 text-start ${
                    selected?.id === asset.id ? 'border-ink' : 'border-line'
                  } ${asset.deletedAt ? 'opacity-60' : ''}`}
                >
                  <span className="relative block aspect-square overflow-hidden border border-line bg-paper">
                    {/* Plain <img>: library thumbnails come straight off the
                        public bucket — no optimizer pass (avatar precedent). */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.alt}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {asset.deletedAt ? (
                      <span className="absolute start-1 top-1 border border-danger bg-surface px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-danger">
                        {t('grid.deletedChip')}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 block truncate font-mono text-[10px] text-ink-2">
                    {filename(asset.path)}
                  </span>
                  <span className="block truncate text-[12px] text-ink">{asset.alt}</span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <aside className="border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-ink px-4 py-2.5">
                <MonographLabel as="span" size="sm">
                  {t('detail.heading')}
                </MonographLabel>
                <button
                  type="button"
                  aria-label={t('detail.close')}
                  onClick={() => apply({ asset: null })}
                  className="font-mono text-[13px] text-ink-2 hover:text-ink"
                >
                  ×
                </button>
              </div>

              <div className="flex flex-col gap-3 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.url}
                  alt={selected.alt}
                  className="max-h-60 w-full border border-line bg-paper object-contain"
                />

                <p className="break-all font-mono text-[10.5px] text-ink-2">{selected.path}</p>

                <p className="font-mono text-[11px] tabular-nums text-ink">
                  {t('detail.dimensions', {
                    width: selected.width,
                    height: selected.height,
                    kilobytes: formatKilobytes(selected.bytes),
                  })}
                </p>

                <p className="text-[12px] text-ink-2">
                  {t('detail.uploadedLine', {
                    date: formatDate(selected.createdAt),
                    username: selected.uploadedBy?.username ?? '—',
                  })}
                  {selected.replacedAt ? (
                    <>
                      <br />
                      {t('detail.replacedLine', { date: formatDate(selected.replacedAt) })}
                    </>
                  ) : null}
                </p>

                {selected.deletedAt ? (
                  <p className="text-[12px] text-warn">
                    {t('detail.deletedLine', { date: formatDate(selected.deletedAt) })}
                  </p>
                ) : null}

                <div>
                  <MonographLabel as="div" size="sm" className="mb-1.5">
                    {t('detail.tagsLabel')}
                  </MonographLabel>
                  {selected.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span
                          key={tag}
                          className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] text-ink-2">{t('detail.noTags')}</p>
                  )}
                </div>

                <div className="border-t border-line pt-3">
                  <MonographLabel as="div" size="sm" className="mb-1.5">
                    {t('detail.usageHeading')}
                  </MonographLabel>
                  <p className="text-[12.5px] text-ink">
                    {t('detail.usedIn', { count: usage.length })}
                  </p>
                  {usage.length > 0 ? (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {usage.map((entry) => (
                        <li key={entry.subtopicId} className="flex items-center gap-2">
                          <Link
                            href={`/admin/content/subtopic/${entry.subtopicId}`}
                            className="min-w-0 truncate text-[12.5px] text-primary underline-offset-2 hover:underline"
                          >
                            {entry.title}
                          </Link>
                          {entry.source === 'draft' ? (
                            <span className="border border-warn/60 bg-warn/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-warn">
                              {t('detail.draftUse')}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
                  {selected.deletedAt ? (
                    <Button
                      size="sm"
                      pending={pending}
                      onClick={() =>
                        run(() => restoreMediaAsset(selected.id), t('toasts.restored'))
                      }
                    >
                      {t('detail.restore')}
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        pending={pending}
                        onClick={() => replaceInputRef.current?.click()}
                      >
                        {t('detail.replace')}
                      </Button>
                      <input
                        ref={replaceInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          onReplacePicked(event.target.files?.[0])
                          event.target.value = ''
                        }}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        pending={pending}
                        disabled={usage.length > 0}
                        onClick={() =>
                          run(() => softDeleteMediaAsset(selected.id), t('toasts.deleted'))
                        }
                      >
                        {t('detail.delete')}
                      </Button>
                    </>
                  )}
                </div>
                {!selected.deletedAt && usage.length > 0 ? (
                  <p className="text-[12px] text-warn">{t('detail.deleteBlockedNote')}</p>
                ) : null}
                {!selected.deletedAt ? (
                  <p className="text-[12px] text-ink-2">{t('detail.replaceHint')}</p>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      )}

      {uploadOpen ? (
        <UploadSheet
          onClose={() => setUploadOpen(false)}
          onUploaded={(assetId) => {
            setUploadOpen(false)
            toast({ title: t('toasts.uploaded') })
            apply({ asset: assetId })
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function UploadSheet({
  onClose,
  onUploaded,
}: {
  onClose: () => void
  onUploaded: (assetId: string) => void
}) {
  const t = useTranslations('admin.media')
  const [pending, startTransition] = useTransition()
  const [alt, setAlt] = useState('')
  const [tags, setTags] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const submit = () => {
    setError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) return setError(t('errors.badFile'))
    if (!alt.trim()) return setError(t('errors.altRequired'))

    startTransition(async () => {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('alt', alt.trim())
      formData.set('tags', tags)
      const result = await uploadMediaAsset(formData)
      if (!result.ok) return setError(result.error)
      onUploaded(result.asset.id)
    })
  }

  return (
    <AdminSheet open title={t('sheet.title')} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <Field label={t('sheet.file')} labelFor="media-file" hint={t('sheet.fileHint')} required>
          <input
            id="media-file"
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="w-full text-[13px] text-ink file:me-3 file:h-8 file:cursor-pointer file:border file:border-ink file:bg-transparent file:px-3 file:font-sans file:text-[13px] file:font-medium file:text-ink"
          />
        </Field>

        <Field label={t('sheet.alt')} labelFor="media-alt" hint={t('sheet.altHint')} required>
          <input
            id="media-alt"
            className={fieldClass}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
          />
        </Field>

        <Field label={t('sheet.tags')} labelFor="media-tags" hint={t('sheet.tagsHint')}>
          <input
            id="media-tags"
            className={fieldClass}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-3 border-t border-line pt-4">
          <Button size="sm" pending={pending} onClick={submit}>
            {t('sheet.upload')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('sheet.cancel')}
          </Button>
        </div>
      </div>
    </AdminSheet>
  )
}
