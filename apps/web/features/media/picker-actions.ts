'use server'

import { getTranslations } from 'next-intl/server'
import { getAdminProfile } from '@/features/admin/queries'
import { listMediaAssets } from './queries'

/*
 * Read path for the editor's image picker (M4 §6: the Plate image block's
 * picker IS the library). A server action so the client sheet can search
 * without a page navigation; staff-gated, live (non-deleted) assets only.
 */

export type PickerAsset = {
  id: string
  url: string
  alt: string
  width: number
  height: number
  path: string
}

export type PickerListResult = { ok: true; assets: PickerAsset[] } | { ok: false; error: string }

export async function listPickerAssets(search: string): Promise<PickerListResult> {
  const t = await getTranslations('admin.content.errors')
  const profile = await getAdminProfile()
  if (!profile) return { ok: false, error: t('forbidden') }

  const assets = await listMediaAssets({ search: search.trim() || undefined })
  return {
    ok: true,
    assets: assets
      .filter((asset) => !asset.deletedAt)
      .slice(0, 60)
      .map((asset) => ({
        id: asset.id,
        url: asset.url,
        alt: asset.alt,
        width: asset.width,
        height: asset.height,
        path: asset.path,
      })),
  }
}
