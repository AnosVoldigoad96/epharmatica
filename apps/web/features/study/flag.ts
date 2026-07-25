import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@epharmatica/database'
import type { AnchorKind } from '@epharmatica/editor'
import { ANCHOR_KINDS } from './anchor-schema'

/**
 * The `highlight_kinds` feature flag (M1 R-M1): which anchor kinds the
 * highlighter accepts. Read SERVER-SIDE (public-read RLS) and passed to
 * the client layer inside the study-state payload; the create action
 * re-checks it. `enabled=false` disables highlight creation entirely;
 * the value is a kind array (migration 025) — the legacy '"all"' spelling
 * and any malformed value normalize defensively to every kind, matching
 * the seed's intent (restricting requires an explicit list).
 */

export type HighlightKindsFlag = { enabled: boolean; kinds: AnchorKind[] }

const ALL_KINDS: AnchorKind[] = [...ANCHOR_KINDS]

export async function readHighlightKindsFlag(
  supabase: SupabaseClient<Database>,
): Promise<HighlightKindsFlag> {
  const { data } = await supabase
    .from('feature_flags')
    .select('enabled, value')
    .eq('key', 'highlight_kinds')
    .maybeSingle()

  if (!data) return { enabled: true, kinds: ALL_KINDS }

  const kinds = Array.isArray(data.value)
    ? data.value.filter((kind): kind is AnchorKind =>
        (ANCHOR_KINDS as readonly string[]).includes(String(kind)),
      )
    : ALL_KINDS
  return { enabled: data.enabled, kinds: kinds.length > 0 ? kinds : ALL_KINDS }
}
