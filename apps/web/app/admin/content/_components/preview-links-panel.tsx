'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, MonographLabel, useToast } from '@epharmatica/ui'
import { createPreviewLink, revokePreviewLink } from '@/features/content/preview-actions'
import type { PreviewLinkSummary } from '@/features/content/queries'

/**
 * Per-subtopic preview links (M4 §5.7 · hi-fi 2e "PREVIEW LINKS" panel):
 * token tail · creator · expiry countdown · opens count · Revoke. Creating
 * shows the FULL URL exactly once with a copy affordance — the raw token
 * is never retrievable again (hashed at rest).
 */
export function PreviewLinksPanel({
  subtopicId,
  links,
  canCreate,
}: {
  subtopicId: string
  links: PreviewLinkSummary[]
  canCreate: boolean
}) {
  const t = useTranslations('admin.content.previewLinks')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [freshUrl, setFreshUrl] = useState<string | null>(null)

  const active = links.filter((link) => !link.revokedAt && !link.expired)

  const create = () => {
    startTransition(async () => {
      const result = await createPreviewLink(subtopicId)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      setFreshUrl(result.url)
      router.refresh()
    })
  }

  const revoke = (linkId: string) => {
    startTransition(async () => {
      const result = await revokePreviewLink(linkId)
      if (!result.ok) toast({ title: result.error, variant: 'error' })
      else toast({ title: t('revoked') })
      router.refresh()
    })
  }

  return (
    <section className="border border-line bg-surface p-4">
      <MonographLabel as="h2" size="sm" className="mb-3 text-ink">
        {t('heading', { count: active.length })}
      </MonographLabel>

      {freshUrl ? (
        <div className="mb-3 border border-warn/50 bg-warn/10 p-3">
          <p className="mb-2 text-[11px] text-ink-2">{t('freshNote')}</p>
          <p className="break-all font-mono text-[11px]">{freshUrl}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(freshUrl)
                toast({ title: t('copied') })
              }}
            >
              {t('copy')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFreshUrl(null)}>
              {t('dismiss')}
            </Button>
          </div>
        </div>
      ) : null}

      {links.length === 0 ? (
        <p className="mb-3 text-[12.5px] text-ink-2">{t('empty')}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {links.map((link) => {
            const dead = Boolean(link.revokedAt) || link.expired
            return (
              <li
                key={link.id}
                className={`flex items-center gap-2 border-b border-line pb-2 text-[12px] last:border-b-0 ${
                  dead ? 'opacity-50' : ''
                }`}
              >
                <span className="font-mono text-[11px]">····{link.tail}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{link.createdBy ?? '—'}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                  {link.revokedAt ? t('revokedTag') : t('expiry', { days: link.daysLeft })}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-ink-2">
                  {t('opens', { count: link.opens })}
                </span>
                {!dead ? (
                  <button
                    type="button"
                    className="text-[11.5px] text-danger underline-offset-2 hover:underline"
                    onClick={() => revoke(link.id)}
                  >
                    {t('revoke')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {canCreate ? (
        <Button size="sm" variant="ghost" pending={pending} onClick={create}>
          {t('create')}
        </Button>
      ) : null}
      <p className="mt-2 text-[11px] text-ink-2">{t('helper')}</p>
    </section>
  )
}
