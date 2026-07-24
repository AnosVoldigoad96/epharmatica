import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { RichText, validateContent } from '@epharmatica/editor'
import { MonographLabel } from '@epharmatica/ui'
import { getClientIpHash } from '@/lib/security/hash'
import { createClient } from '@/lib/supabase/server'

/*
 * Anonymous draft preview (M4-4 §5.7): the ONLY public path to a draft.
 * The security-definer RPC (012) validates hash + expiry + revocation,
 * enforces 30 opens/hr/IP in-function, and logs the open — this page just
 * renders what it returns: fixed DRAFT watermark bar, read-only render
 * through the real renderer, no study tools, no site nav, noindex. Every
 * failure mode renders ONE neutral card — the response never distinguishes
 * expired from revoked from unknown.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('preview')
  return { title: t('title'), robots: { index: false, follow: false } }
}

type PreviewPayload = {
  subtopic_id: string
  title: string
  content: unknown
  reading_minutes: number
  updated_at: string
}

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('preview')

  const supabase = await createClient()
  const [ipHash, headerList] = await Promise.all([getClientIpHash(), headers()])
  const { data } = await supabase.rpc('open_preview_link', {
    p_token: token,
    p_ip_hash: ipHash as unknown as string,
    p_ua: (headerList.get('user-agent') ?? '').slice(0, 250),
  })

  const payload = (data ?? null) as PreviewPayload | null
  const validated = payload ? validateContent(payload.content) : null

  if (!payload || !validated?.ok) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
        <div className="w-full border border-line bg-surface p-8 text-center">
          <MonographLabel as="div" size="sm" className="mb-3">
            {t('inactiveLabel')}
          </MonographLabel>
          <p className="text-[14px] text-ink-2">{t('inactiveBody')}</p>
        </div>
      </main>
    )
  }

  return (
    <>
      <div className="sticky top-0 z-[var(--z-sticky)] border-b border-warn bg-warn px-5 py-2 text-center">
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-paper">
          {t('watermark')}
        </span>
      </div>
      <main className="mx-auto max-w-[68ch] px-5 pb-16 pt-8">
        <MonographLabel as="div" size="sm" className="mb-2">
          {t('eyebrow')}
        </MonographLabel>
        <h1 className="mb-2 font-display text-3xl font-bold">{payload.title}</h1>
        <p className="mb-8 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
          {t('meta', { minutes: payload.reading_minutes })}
        </p>
        <RichText content={validated.content} />
      </main>
    </>
  )
}
