'use server'

import { getTranslations } from 'next-intl/server'
import { AUTHORING_ROLES, DbActionError, failureFrom, requireRoles } from '@/features/content/gate'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'

/*
 * Media-library server actions (M4-3 §6 · dev-plan 1.B). Content-action
 * conventions throughout: discriminated-union results, never throw to the
 * client, copy via getTranslations, every mutation behind requireRoles
 * (author+, rate-limited in the gate) and INSIDE withAudit() (I8).
 *
 * Storage runs on the USER server client — the staff storage.objects
 * policies from migration 010 are the authority (never the service role).
 * The extension is not trust (securities.md §8): every upload is sniffed
 * by magic bytes, then normalized through sharp to WebP (auto-orient, max
 * edge 1920, ≤ 2 MB post-compress — the bucket limit is the backstop).
 */

export type MediaActionResult = { ok: true } | { ok: false; error: string }

export type UploadedAsset = {
  id: string
  url: string
  alt: string
  width: number
  height: number
}

export type UploadMediaResult = { ok: true; asset: UploadedAsset } | { ok: false; error: string }

const BUCKET = 'content-media'
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024 // bucket file_size_limit (migration 010)
const MAX_INPUT_BYTES = 25 * 1024 * 1024 // pre-compression sanity cap
const MAX_EDGE = 1920

// ---------------------------------------------------------------------------
// Type sniffing (magic bytes — the isWebp precedent from account actions)
// ---------------------------------------------------------------------------

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 && // P
    bytes[2] === 0x4e && // N
    bytes[3] === 0x47 // G
  )
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  )
}

// ---------------------------------------------------------------------------
// Processing — sharp, imported lazily so it never reaches edge/client bundles
// ---------------------------------------------------------------------------

type Processed = { data: Buffer; width: number; height: number; bytes: number }

/**
 * Auto-orient, bound to the 1920 max edge (never enlarging), convert to
 * WebP q82; if still over the 2 MB bucket cap, one retry at q60. Returns
 * 'invalid' for input sharp cannot decode, 'too-large' when even q60
 * cannot fit the cap.
 */
async function processImage(input: Uint8Array): Promise<Processed | 'invalid' | 'too-large'> {
  const sharp = (await import('sharp')).default
  try {
    for (const quality of [82, 60]) {
      const { data, info } = await sharp(input)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true })
      if (info.size <= MAX_OUTPUT_BYTES) {
        return { data, width: info.width, height: info.height, bytes: info.size }
      }
    }
    return 'too-large'
  } catch {
    return 'invalid'
  }
}

function parseTags(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string') return []
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20)
}

type SniffedFile = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

/** Pull `file` off the form, size-cap it, and sniff PNG/JPEG/WebP. */
async function readSniffedFile(formData: FormData): Promise<SniffedFile> {
  const t = await getTranslations('admin.media.errors')
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: t('badFile') }
  }
  if (file.size > MAX_INPUT_BYTES) {
    return { ok: false, error: t('tooLarge') }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isPng(bytes) && !isJpeg(bytes) && !isWebp(bytes)) {
    return { ok: false, error: t('badFile') }
  }
  return { ok: true, bytes }
}

async function processOrFail(bytes: Uint8Array): Promise<Processed | { error: string }> {
  const t = await getTranslations('admin.media.errors')
  const processed = await processImage(bytes)
  if (processed === 'invalid') return { error: t('badFile') }
  if (processed === 'too-large') return { error: t('tooLarge') }
  return processed
}

// ---------------------------------------------------------------------------
// Upload (M4 §6: alt required at upload — no alt, no save)
// ---------------------------------------------------------------------------

export async function uploadMediaAsset(formData: FormData): Promise<UploadMediaResult> {
  const t = await getTranslations('admin.media.errors')
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const alt = String(formData.get('alt') ?? '').trim()
  if (!alt) return { ok: false, error: t('altRequired') }
  const tags = parseTags(formData.get('tags'))

  const sniffed = await readSniffedFile(formData)
  if (!sniffed.ok) return sniffed
  const processed = await processOrFail(sniffed.bytes)
  if ('error' in processed) return { ok: false, error: processed.error }

  const supabase = await createClient()
  const path = `library/${crypto.randomUUID()}.webp`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, processed.data, { contentType: 'image/webp' })
  if (uploadError) {
    // Ops visibility (docker logs): the user-facing copy is generic by
    // design; the underlying storage error is the diagnosable part.
    console.error('[media] upload failed', path, uploadError.message)
    return { ok: false, error: t('uploadFailed') }
  }

  try {
    const assetId = await withAudit<string>(
      (id) => ({
        action: AUDIT_ACTIONS.media_uploaded,
        actorId: gate.profile.id,
        entity: 'media',
        entityId: id,
        meta: {
          path,
          width: processed.width,
          height: processed.height,
          bytes: processed.bytes,
        },
      }),
      async () => {
        const { data, error } = await supabase
          .from('media_assets')
          .insert({
            path,
            alt,
            tags,
            width: processed.width,
            height: processed.height,
            bytes: processed.bytes,
            uploaded_by: gate.profile.id,
          })
          .select('id')
          .single()
        if (error || !data) throw new DbActionError(error)
        return data.id
      },
    )

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
    return {
      ok: true,
      asset: {
        id: assetId,
        url: urlData.publicUrl,
        alt,
        width: processed.width,
        height: processed.height,
      },
    }
  } catch (err) {
    // Roll the orphaned object back (best effort) — the avatar precedent.
    await supabase.storage.from(BUCKET).remove([path])
    return failureFrom(err)
  }
}

// ---------------------------------------------------------------------------
// Replace-in-place (M4 §6): same asset id, same path — usages update on
// their next publish; the prior file is copied aside for the 30-day
// retention window (the purge cron is later work).
// ---------------------------------------------------------------------------

export async function replaceMediaAsset(
  assetId: string,
  formData: FormData,
): Promise<UploadMediaResult> {
  const t = await getTranslations('admin.media.errors')
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  const { data: row, error: readError } = await supabase
    .from('media_assets')
    .select('id, path, alt')
    .eq('id', assetId)
    .maybeSingle()
  if (readError || !row) return { ok: false, error: t('notFound') }

  const sniffed = await readSniffedFile(formData)
  if (!sniffed.ok) return sniffed
  const processed = await processOrFail(sniffed.bytes)
  if ('error' in processed) return { ok: false, error: processed.error }

  // Retain the prior file FIRST — no copy, no replace (30-day window).
  const retiredPath = `library/retired/${assetId}-${Date.now()}.webp`
  const { error: copyError } = await supabase.storage.from(BUCKET).copy(row.path, retiredPath)
  if (copyError) {
    console.error('[media] retire-copy failed', row.path, copyError.message)
    return { ok: false, error: t('uploadFailed') }
  }

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(row.path, processed.data, { contentType: 'image/webp', upsert: true })
  if (uploadError) {
    console.error('[media] replace-upload failed', row.path, uploadError.message)
    return { ok: false, error: t('uploadFailed') }
  }

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.media_replaced,
        actorId: gate.profile.id,
        entity: 'media',
        entityId: assetId,
        meta: {
          path: row.path,
          retired_path: retiredPath,
          width: processed.width,
          height: processed.height,
          bytes: processed.bytes,
        },
      },
      async () => {
        const { error } = await supabase
          .from('media_assets')
          .update({
            width: processed.width,
            height: processed.height,
            bytes: processed.bytes,
            replaced_at: new Date().toISOString(),
          })
          .eq('id', assetId)
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(row.path)
  return {
    ok: true,
    asset: {
      id: assetId,
      url: urlData.publicUrl,
      alt: row.alt,
      width: processed.width,
      height: processed.height,
    },
  }
}

// ---------------------------------------------------------------------------
// Soft delete / restore (M4 §6: blocked while used; 30-day undo — the
// hard-purge cron is later work). The media_refs count is the friendly
// gate; the FK RESTRICT underneath is the backstop.
// ---------------------------------------------------------------------------

export async function softDeleteMediaAsset(assetId: string): Promise<MediaActionResult> {
  const t = await getTranslations('admin.media.errors')
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  const { count, error: countError } = await supabase
    .from('media_refs')
    .select('subtopic_id', { count: 'exact', head: true })
    .eq('asset_id', assetId)
  if (countError) return failureFrom(new DbActionError(countError))
  if (count && count > 0) {
    return { ok: false, error: t('deleteBlocked', { count }) }
  }

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.media_deleted,
        actorId: gate.profile.id,
        entity: 'media',
        entityId: assetId,
      },
      async () => {
        const { data, error } = await supabase
          .from('media_assets')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', assetId)
          .select('id')
          .maybeSingle()
        if (error) throw new DbActionError(error)
        if (!data) throw new DbActionError(null)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

export async function restoreMediaAsset(assetId: string): Promise<MediaActionResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.media_restored,
        actorId: gate.profile.id,
        entity: 'media',
        entityId: assetId,
      },
      async () => {
        const { data, error } = await supabase
          .from('media_assets')
          .update({ deleted_at: null })
          .eq('id', assetId)
          .select('id')
          .maybeSingle()
        if (error) throw new DbActionError(error)
        if (!data) throw new DbActionError(null)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}
