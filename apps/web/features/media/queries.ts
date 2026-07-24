/**
 * Media-library reads (M4-3 §6 · dev-plan 1.B). RSC-only, on the staff
 * member's cookie-bound client — RLS is the authority (staff read covers
 * soft-deleted rows; media_refs are staff-read, service-role-written).
 * Search rides the trigram indexes on path/alt from migration 012.
 */
import 'server-only'

import { getStaffDirectory } from '@/features/content/queries'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'content-media'

export type MediaAssetSummary = {
  id: string
  path: string
  url: string
  alt: string
  tags: string[]
  width: number
  height: number
  bytes: number
  uploadedBy: { id: string; username: string } | null
  createdAt: string
  replacedAt: string | null
  deletedAt: string | null
  /** Distinct subtopics referencing the asset (published + draft scans). */
  usageCount: number
}

export type MediaLibraryFilters = {
  /** ilike over path OR alt (trigram-indexed). */
  search?: string
  /** Filter to one uploader (profile id). */
  uploader?: string
  /** Only assets with zero media_refs. */
  unusedOnly?: boolean
  /** Include soft-deleted assets (staff read, the undo surface). */
  includeDeleted?: boolean
}

/** Escape LIKE wildcards and the PostgREST or() delimiters. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, '\\$&').replace(/[,()]/g, ' ')}%`
}

export async function listMediaAssets(
  filters: MediaLibraryFilters = {},
): Promise<MediaAssetSummary[]> {
  const supabase = await createClient()
  const staff = await getStaffDirectory()

  let query = supabase
    .from('media_assets')
    .select(
      'id, path, alt, tags, width, height, bytes, uploaded_by, created_at, replaced_at, deleted_at',
    )
    .order('created_at', { ascending: false })

  if (!filters.includeDeleted) query = query.is('deleted_at', null)
  if (filters.uploader) query = query.eq('uploaded_by', filters.uploader)
  if (filters.search?.trim()) {
    const pattern = likePattern(filters.search.trim())
    query = query.or(`path.ilike.${pattern},alt.ilike.${pattern}`)
  }

  const { data: rows } = await query
  if (!rows || rows.length === 0) return []

  // Per-asset usage = DISTINCT subtopics (a subtopic can hold both a
  // published and a draft ref; it is still one subtopic using the asset).
  const { data: refs } = await supabase
    .from('media_refs')
    .select('asset_id, subtopic_id')
    .in(
      'asset_id',
      rows.map((row) => row.id),
    )
  const usage = new Map<string, Set<string>>()
  for (const ref of refs ?? []) {
    const set = usage.get(ref.asset_id) ?? new Set<string>()
    set.add(ref.subtopic_id)
    usage.set(ref.asset_id, set)
  }

  const assets = rows.map((row) => {
    const uploader = row.uploaded_by ? staff.get(row.uploaded_by) : undefined
    return {
      id: row.id,
      path: row.path,
      url: supabase.storage.from(BUCKET).getPublicUrl(row.path).data.publicUrl,
      alt: row.alt,
      tags: row.tags,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      uploadedBy:
        row.uploaded_by !== null
          ? { id: row.uploaded_by, username: uploader?.username ?? '—' }
          : null,
      createdAt: row.created_at,
      replacedAt: row.replaced_at,
      deletedAt: row.deleted_at,
      usageCount: usage.get(row.id)?.size ?? 0,
    }
  })

  return filters.unusedOnly ? assets.filter((asset) => asset.usageCount === 0) : assets
}

export type AssetUsageEntry = {
  subtopicId: string
  title: string
  /** 'published' from the publish scan; 'draft' from the periodic scan. */
  source: 'published' | 'draft'
}

/**
 * Where the asset is used (M4 §6: "Used in N subtopics", each linked;
 * draft uses marked). One entry per subtopic — a published ref wins over
 * a draft ref for the same subtopic.
 */
export async function getAssetUsage(assetId: string): Promise<AssetUsageEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('media_refs')
    .select('subtopic_id, source, subtopics(title)')
    .eq('asset_id', assetId)

  const bySubtopic = new Map<string, AssetUsageEntry>()
  for (const ref of data ?? []) {
    const existing = bySubtopic.get(ref.subtopic_id)
    const source = ref.source === 'draft' ? 'draft' : 'published'
    if (existing && (existing.source === 'published' || source === 'draft')) continue
    bySubtopic.set(ref.subtopic_id, {
      subtopicId: ref.subtopic_id,
      title: ref.subtopics?.title ?? '—',
      source,
    })
  }
  return [...bySubtopic.values()].sort((a, b) => a.title.localeCompare(b.title))
}
