import 'server-only'

import { reanchorHighlights } from '@epharmatica/editor'
import type { Json } from '@epharmatica/database'
import { createClient } from '@/lib/supabase/server'

/**
 * The post-publish re-anchor job (M1 §5.5) — the app-side driver around the
 * pure @epharmatica/editor algorithm and the 025 RPC pair.
 *
 * Per subtopic: fetch every non-orphaned anchor (reanchor_fetch — CM+ gated,
 * cross-owner by design), resolve against the CURRENT publish snapshot, and
 * apply only the non-keep outcomes (reanchor_apply validates and scopes).
 * The old snapshot is never needed: the stored anchor IS the old-location
 * record. On a Move… (path change, content identical) every anchor resolves
 * to keep and apply is skipped — the job is cheap by construction there.
 *
 * Failures NEVER propagate: a re-anchor hiccup must not fail (or roll back
 * the audit of) a publish that already happened. Stale anchors self-heal on
 * the next publish; orphan-first is the module's no-data-loss posture.
 */
export type ReanchorSummary = {
  highlights: number
  kept: number
  repathed: number
  moved: number
  orphaned: number
  failed: boolean
}

export async function runReanchor(subtopicIds: string[]): Promise<ReanchorSummary> {
  const summary: ReanchorSummary = {
    highlights: 0,
    kept: 0,
    repathed: 0,
    moved: 0,
    orphaned: 0,
    failed: false,
  }

  try {
    const supabase = await createClient()

    for (const subtopicId of subtopicIds) {
      const { data: rows, error: fetchError } = await supabase.rpc('reanchor_fetch', {
        p_subtopic_id: subtopicId,
      })
      if (fetchError) throw fetchError
      if (!rows || rows.length === 0) continue

      const { data: row, error: readError } = await supabase
        .from('subtopics')
        .select('published_content')
        .eq('id', subtopicId)
        .maybeSingle()
      if (readError) throw readError
      if (!row?.published_content) continue

      const results = reanchorHighlights(null, row.published_content, rows)
      summary.highlights += results.length
      for (const result of results) {
        if (result.action === 'keep') summary.kept += 1
        else if (result.action === 'repath') summary.repathed += 1
        else if (result.action === 'move') summary.moved += 1
        else summary.orphaned += 1
      }

      const changes = results.filter((result) => result.action !== 'keep')
      if (changes.length > 0) {
        const { error: applyError } = await supabase.rpc('reanchor_apply', {
          p_subtopic_id: subtopicId,
          p_results: changes as unknown as Json,
        })
        if (applyError) throw applyError
      }
    }
  } catch {
    summary.failed = true
  }

  return summary
}
