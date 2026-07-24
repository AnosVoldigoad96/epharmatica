/**
 * Settings reads (M4 §8 · dev-plan 1.B). RSC-only, on the staff member's
 * cookie-bound client — RLS is the authority (feature_flags/site_settings
 * are public-read, ai_models authenticated-read, personal_data_registry
 * admin-read; the page gate keeps the surface admin+).
 */
import 'server-only'

import type { Json } from '@epharmatica/database'
import { createClient } from '@/lib/supabase/server'

export type FeatureFlagRow = {
  key: string
  enabled: boolean
  value: Json | null
  description: string | null
  phase_tag: string | null
}

/** Feature-flag table (§8): key-ordered — the keys group by prefix. */
export async function listFlags(): Promise<FeatureFlagRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('feature_flags')
    .select('key, enabled, value, description, phase_tag')
    .order('key')
  return data ?? []
}

export type AiModelRow = {
  id: string
  provider: string
  model_id: string
  label: string
  tier_note: string | null
  is_default: boolean
  active: boolean
  sort: number
}

/** The ai_models registry (M3 §4.1 editor) in picker order. */
export async function listAiModels(): Promise<AiModelRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ai_models')
    .select('id, provider, model_id, label, tier_note, is_default, active, sort')
    .order('sort')
    .order('provider')
    .order('model_id')
  return data ?? []
}

export type SiteSettingsData = {
  title: string
  description: string
  socialImage: string
  /** address key (support/legal/privacy/jobs…) → email, DB order kept. */
  contacts: Record<string, string>
}

/** The seeded site.* keys (016) shaped for the metadata panel. */
export async function getSiteSettings(): Promise<SiteSettingsData> {
  const supabase = await createClient()
  const { data } = await supabase.from('site_settings').select('key, value')
  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]))

  const str = (value: Json | undefined): string => (typeof value === 'string' ? value : '')
  const contacts: Record<string, string> = {}
  const contactsRaw = byKey.get('site.contacts')
  if (contactsRaw && typeof contactsRaw === 'object' && !Array.isArray(contactsRaw)) {
    for (const [key, value] of Object.entries(contactsRaw)) {
      if (typeof value === 'string') contacts[key] = value
    }
  }

  return {
    title: str(byKey.get('site.title')),
    description: str(byKey.get('site.description')),
    socialImage: str(byKey.get('site.social_image')),
    contacts,
  }
}

/** Reserved handles (M2 §4.4 list editor), alphabetical. */
export async function listReservedUsernames(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('reserved_usernames').select('handle').order('handle')
  return (data ?? []).map((row) => row.handle)
}

export type RegistryRow = {
  table_name: string
  module: string
  purge_step: number
  notes: string | null
}

/** The purge map (M2 R-M2b), in cron step order — read-only viewer. */
export async function listPersonalDataRegistry(): Promise<RegistryRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('personal_data_registry')
    .select('table_name, module, purge_step, notes')
    .order('purge_step')
    .order('table_name')
  return data ?? []
}
