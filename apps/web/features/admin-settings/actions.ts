'use server'

import { revalidateTag } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import type { Json } from '@epharmatica/database'
import { usernameSchema } from '@epharmatica/database'
import { DbActionError, failureFrom, requireRoles } from '@/features/content/gate'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'

/*
 * Settings server actions (M4 §8 · dev-plan 1.B). Content-action
 * conventions: discriminated-union results, never throw to the client,
 * copy via getTranslations, every mutation behind requireRoles (admin+,
 * rate-limited in the gate) and INSIDE withAudit() (I8). RLS admin-write
 * policies (003/007/016) are the authority underneath.
 */

export type SettingsActionResult = { ok: true } | { ok: false; error: string }

const ADMIN_ROLES = ['admin', 'super_admin'] as const

// ---------------------------------------------------------------------------
// Feature flags (§8: audited flips, cache-busted via the `flags` tag)
// ---------------------------------------------------------------------------

export async function setFlag(key: string, enabled: boolean): Promise<SettingsActionResult> {
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_flag_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: key,
        meta: { enabled },
      },
      async () => {
        const { data, error } = await supabase
          .from('feature_flags')
          .update({ enabled })
          .eq('key', key)
          .select('key')
          .maybeSingle()
        if (error) throw new DbActionError(error)
        if (!data) throw new DbActionError(null)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  revalidateTag('flags', 'max')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// AI model registry (§8 / M3 §4.1: add, edit, deactivate, set default, sort)
// ---------------------------------------------------------------------------

export type AiModelInput = {
  id?: string
  provider: string
  modelId: string
  label: string
  tierNote?: string
}

export async function upsertAiModel(input: AiModelInput): Promise<SettingsActionResult> {
  const t = await getTranslations('admin.settings.errors')
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const provider = input.provider.trim().toLowerCase()
  const modelId = input.modelId.trim()
  const label = input.label.trim()
  const tierNote = input.tierNote?.trim() || null
  if (!provider || !modelId || !label) return { ok: false, error: t('modelFieldsRequired') }

  const supabase = await createClient()
  try {
    await withAudit<string>(
      (id) => ({
        action: AUDIT_ACTIONS.settings_ai_model_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: id,
        meta: { op: input.id ? 'edit' : 'add', provider, model_id: modelId },
      }),
      async () => {
        if (input.id) {
          const { data, error } = await supabase
            .from('ai_models')
            .update({ provider, model_id: modelId, label, tier_note: tierNote })
            .eq('id', input.id)
            .select('id')
            .maybeSingle()
          if (error) throw new DbActionError(error)
          if (!data) throw new DbActionError(null)
          return data.id
        }
        // New models append at the end of the picker order.
        const { data: last } = await supabase
          .from('ai_models')
          .select('sort')
          .order('sort', { ascending: false })
          .limit(1)
          .maybeSingle()
        const { data, error } = await supabase
          .from('ai_models')
          .insert({
            provider,
            model_id: modelId,
            label,
            tier_note: tierNote,
            sort: (last?.sort ?? 0) + 1,
          })
          .select('id')
          .single()
        if (error || !data) throw new DbActionError(error)
        return data.id
      },
    )
  } catch (err) {
    const dbError = err instanceof DbActionError ? err.dbError : null
    if (dbError?.code === '23505') return { ok: false, error: t('modelDuplicate') }
    return failureFrom(err)
  }
  return { ok: true }
}

/**
 * Deactivate/reactivate (§8). Inactive rows stay readable — a saved model
 * selection that was deactivated must still be labeled in user Settings.
 */
export async function setAiModelActive(id: string, active: boolean): Promise<SettingsActionResult> {
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_ai_model_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: id,
        meta: { op: active ? 'activate' : 'deactivate' },
      },
      async () => {
        const { data, error } = await supabase
          .from('ai_models')
          .update({ active })
          .eq('id', id)
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

/** One default across the registry: clear the previous holder, set the new. */
export async function setDefaultAiModel(id: string): Promise<SettingsActionResult> {
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_ai_model_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: id,
        meta: { op: 'set_default' },
      },
      async () => {
        const cleared = await supabase
          .from('ai_models')
          .update({ is_default: false })
          .eq('is_default', true)
          .neq('id', id)
        if (cleared.error) throw new DbActionError(cleared.error)
        const { data, error } = await supabase
          .from('ai_models')
          .update({ is_default: true })
          .eq('id', id)
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

/** Persist a full picker order (the reorderNodes staleness precedent). */
export async function reorderAiModels(orderedIds: string[]): Promise<SettingsActionResult> {
  const t = await getTranslations('admin.settings.errors')
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase.from('ai_models').select('id')
  if (readError) return failureFrom(new DbActionError(readError))
  const currentIds = (current ?? []).map((row) => row.id)
  if (
    currentIds.length !== orderedIds.length ||
    !currentIds.every((id) => orderedIds.includes(id))
  ) {
    return { ok: false, error: t('reorderStale') }
  }

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_ai_model_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: null,
        meta: { op: 'reorder', count: orderedIds.length },
      },
      async () => {
        for (const [index, id] of orderedIds.entries()) {
          const { error } = await supabase
            .from('ai_models')
            .update({ sort: index + 1 })
            .eq('id', id)
          if (error) throw new DbActionError(error)
        }
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Site metadata (§8: title, description, social image, contact addresses)
// ---------------------------------------------------------------------------

const SITE_SETTING_KEYS = [
  'site.title',
  'site.description',
  'site.social_image',
  'site.contacts',
] as const

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number]

export async function updateSiteSetting(
  key: SiteSettingKey,
  value: Json,
): Promise<SettingsActionResult> {
  const t = await getTranslations('admin.settings.errors')
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  // Update-only over the seeded keys — the settings roster rides migrations.
  if (!SITE_SETTING_KEYS.includes(key)) return { ok: false, error: t('unknownSetting') }

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_site_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: key,
      },
      async () => {
        const { data, error } = await supabase
          .from('site_settings')
          .update({ value })
          .eq('key', key)
          .select('key')
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

// ---------------------------------------------------------------------------
// Reserved usernames (§8 / M2 §4.4 list editor — column is `handle`)
// ---------------------------------------------------------------------------

export async function addReservedUsername(handle: string): Promise<SettingsActionResult> {
  const t = await getTranslations('admin.settings.errors')
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const parsed = usernameSchema.safeParse(handle)
  if (!parsed.success) return { ok: false, error: t('handleInvalid') }

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_reserved_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: parsed.data,
        meta: { op: 'add' },
      },
      async () => {
        const { error } = await supabase.from('reserved_usernames').insert({ handle: parsed.data })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    const dbError = err instanceof DbActionError ? err.dbError : null
    if (dbError?.code === '23505') return { ok: false, error: t('handleExists') }
    return failureFrom(err)
  }
  return { ok: true }
}

export async function removeReservedUsername(handle: string): Promise<SettingsActionResult> {
  const gate = await requireRoles(ADMIN_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.settings_reserved_updated,
        actorId: gate.profile.id,
        entity: 'settings',
        entityId: handle,
        meta: { op: 'remove' },
      },
      async () => {
        const { data, error } = await supabase
          .from('reserved_usernames')
          .delete()
          .eq('handle', handle)
          .select('handle')
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
