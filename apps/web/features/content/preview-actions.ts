'use server'

import { createHash, randomBytes } from 'node:crypto'
import { getTranslations } from 'next-intl/server'
import { AUDIT_ACTIONS, withAudit } from '@/lib/observability/audit'
import { createClient } from '@/lib/supabase/server'
import { AUTHORING_ROLES, DbActionError, failureFrom, requireRoles } from './gate'

/*
 * Draft preview links (M4-4 §5.7 · dev-plan 1.B-4). The raw 128-bit token
 * exists exactly once — in the response that created it. The table stores
 * sha256 + a 4-char display tail; the public path is the security-definer
 * RPC (012), which enforces expiry/revocation/rate caps itself. Publishing
 * auto-revokes (014's publish RPC).
 */

export type CreatePreviewLinkResult =
  { ok: true; url: string; tail: string } | { ok: false; error: string }

export type ActionResult = { ok: true } | { ok: false; error: string }

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'
}

export async function createPreviewLink(subtopicId: string): Promise<CreatePreviewLinkResult> {
  const t = await getTranslations('admin.content.errors')
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()

  // Links exist for unpublished work only (M4 §5.7).
  const { data: subtopic } = await supabase
    .from('subtopics')
    .select('status')
    .eq('id', subtopicId)
    .maybeSingle()
  if (!subtopic) return { ok: false, error: t('notFound') }
  if (subtopic.status === 'published' || subtopic.status === 'archived') {
    return { ok: false, error: t('previewLinkWrongStatus') }
  }

  const token = randomBytes(16).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const tail = token.slice(-4)

  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.preview_link_created,
        actorId: gate.profile.id,
        entity: 'preview_link',
        entityId: subtopicId,
        meta: { tail },
      },
      async () => {
        const { error } = await supabase.from('preview_links').insert({
          subtopic_id: subtopicId,
          token_hash: tokenHash,
          token_tail: tail,
          created_by: gate.profile.id,
        })
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }

  return { ok: true, url: `${siteUrl()}/preview/${token}`, tail }
}

export async function revokePreviewLink(linkId: string): Promise<ActionResult> {
  const gate = await requireRoles(AUTHORING_ROLES)
  if (!gate.ok) return gate

  const supabase = await createClient()
  try {
    await withAudit(
      {
        action: AUDIT_ACTIONS.preview_link_revoked,
        actorId: gate.profile.id,
        entity: 'preview_link',
        entityId: linkId,
      },
      async () => {
        const { error } = await supabase
          .from('preview_links')
          .update({ revoked_at: new Date().toISOString() })
          .eq('id', linkId)
          .is('revoked_at', null)
        if (error) throw new DbActionError(error)
      },
    )
  } catch (err) {
    return failureFrom(err)
  }
  return { ok: true }
}
