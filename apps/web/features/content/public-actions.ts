'use server'

import { validateContent } from '@epharmatica/editor'
import type { Content } from '@epharmatica/editor'
import { createClient } from '@/lib/supabase/server'

/**
 * Member content unlock (1.C · D8/I3). The reader pages are ISR anonymous
 * shells — the full published document only ever leaves the server through
 * this action, and only for a verified session:
 *
 *  - `auth.getUser()` revalidates the JWT against the Auth server (not just
 *    the cookie), so a forged/expired session gets `ok: false` — no gated
 *    JSON is ever serialized for anonymous callers (I3).
 *  - The row filter re-checks `status = 'published'`, so a stale shell can
 *    never unlock a since-unpublished subtopic.
 *  - The snapshot column (`published_content`) is what readers see — never
 *    the live draft columns (those are grant-revoked from anon anyway).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type MemberBlocksResult = { ok: true; blocks: Content } | { ok: false }

export async function getMemberBlocks(subtopicId: string): Promise<MemberBlocksResult> {
  if (typeof subtopicId !== 'string' || !UUID_RE.test(subtopicId)) return { ok: false }

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { ok: false }

  const { data: row } = await supabase
    .from('subtopics')
    .select('published_content')
    .eq('id', subtopicId)
    .eq('status', 'published')
    .maybeSingle()
  if (!row) return { ok: false }

  const validated = validateContent(row.published_content)
  if (!validated.ok) return { ok: false }

  return { ok: true, blocks: validated.content }
}
