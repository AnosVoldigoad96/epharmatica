'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { PickedImage } from '@epharmatica/editor'
import { Button, Field, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import { uploadMediaAsset } from '@/features/media/actions'
import { listPickerAssets } from '@/features/media/picker-actions'
import type { PickerAsset } from '@/features/media/picker-actions'
import { AdminSheet } from './admin-sheet'

/**
 * The editor's image picker (M4 §6): browse/search the media library or
 * upload-in-place (the asset lands in the library, never an orphaned
 * per-subtopic file). Resolves the SubtopicEditor's onPickImage promise.
 */
export function MediaPickerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (picked: PickedImage) => void
}) {
  const t = useTranslations('admin.content.mediaPicker')
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [assets, setAssets] = useState<PickerAsset[] | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [alt, setAlt] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const handle = setTimeout(() => {
      void listPickerAssets(search).then((result) => {
        if (cancelled) return
        if (result.ok) setAssets(result.assets)
        else toast({ title: result.error, variant: 'error' })
      })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [open, search, toast])

  const upload = () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.set('file', file)
    formData.set('alt', alt)
    startTransition(async () => {
      const result = await uploadMediaAsset(formData)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      onPick({
        asset_id: result.asset.id,
        url: result.asset.url,
        alt: result.asset.alt,
        width: result.asset.width,
        height: result.asset.height,
      })
    })
  }

  return (
    <AdminSheet open={open} title={t('title')} onClose={onClose} wide>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label={t('search')} labelFor="picker-search">
              <input
                id="picker-search"
                className={fieldClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setUploadOpen((value) => !value)}>
            {t('uploadToggle')}
          </Button>
        </div>

        {uploadOpen ? (
          <div className="border border-line bg-paper p-4">
            <div className="flex flex-wrap items-end gap-3">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label={t('file')}
                className="text-[13px]"
              />
              <div className="min-w-48 flex-1">
                <Field label={t('alt')} labelFor="picker-alt" hint={t('altHint')}>
                  <input
                    id="picker-alt"
                    className={fieldClass}
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                  />
                </Field>
              </div>
              <Button size="sm" pending={pending} disabled={!alt.trim()} onClick={upload}>
                {t('uploadInsert')}
              </Button>
            </div>
          </div>
        ) : null}

        {assets === null ? (
          <div className="h-40 animate-pulse border border-line bg-paper" />
        ) : assets.length === 0 ? (
          <div className="border border-line bg-paper p-6 text-center">
            <MonographLabel as="div" size="sm" className="mb-2">
              {t('emptyLabel')}
            </MonographLabel>
            <p className="text-[13px] text-ink-2">{t('emptyBody')}</p>
          </div>
        ) : (
          <ul className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {assets.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() =>
                    onPick({
                      asset_id: asset.id,
                      url: asset.url,
                      alt: asset.alt,
                      width: asset.width,
                      height: asset.height,
                    })
                  }
                  className="block w-full border border-line bg-surface p-1 text-start hover:border-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.url}
                    alt={asset.alt}
                    width={asset.width}
                    height={asset.height}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  <span className="block truncate px-1 pt-1 font-mono text-[9.5px] text-ink-2">
                    {asset.path.split('/').pop()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminSheet>
  )
}
