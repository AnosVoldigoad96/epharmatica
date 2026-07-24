'use client'

import { useEffect, useMemo, useState } from 'react'
import { RichText, inlineText } from '@epharmatica/editor'
import type { Content, RichTextLabels, VideoBlock } from '@epharmatica/editor'
import { MonographLabel, StateGlyph } from '@epharmatica/ui'
import { ButtonLink } from '@/app/(marketing)/_components/button-link'
import { withNext } from '@/features/auth/next-param'
import { getMemberBlocks } from '@/features/content/public-actions'
import { LiteYouTube } from '@/features/content/components/lite-youtube'
import { createClient } from '@/lib/supabase/client'

/**
 * Preview gate + member unlock (M1 §5.4 · D8/I3). Mounted only when the ISR
 * anon shell is gated. Initial render = the gate (fade + sign-in card), so
 * anonymous visitors never see a flash. On mount it checks the session with
 * the BROWSER client; if one exists it calls the getMemberBlocks server
 * action — the server re-verifies the session (getUser) before the full
 * published document leaves it. On success the gate is replaced by the
 * remaining blocks (everything past the server-rendered preview), rendered
 * through the same <RichText/>. The gate card stays visible while the
 * unlock resolves.
 */

export type MemberUnlockLabels = {
  gateLabel: string
  /** The three benefit lines — exact PRD copy, in order. */
  benefits: string[]
  createAccount: string
  signIn: string
  playVideo: string
}

export function MemberUnlock({
  subtopicId,
  previewCount,
  nextPath,
  labels,
  richTextLabels,
}: {
  subtopicId: string
  /** How many blocks the server already rendered above this component. */
  previewCount: number
  /** The reader path — carried through the auth flow as ?next=. */
  nextPath: string
  labels: MemberUnlockLabels
  richTextLabels: RichTextLabels
}) {
  const [unlocked, setUnlocked] = useState<Content | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        if (!data.session || cancelled) return
        const result = await getMemberBlocks(subtopicId)
        if (cancelled || !result.ok) return
        setUnlocked(result.blocks.slice(previewCount))
      } catch {
        // Env unset / network hiccup: the gate stays — the anon experience.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [subtopicId, previewCount])

  // Stable component identity so <LiteYouTube/> keeps its play state.
  const Video = useMemo(() => {
    const playLabel = labels.playVideo
    return function UnlockedVideo({ block }: { block: VideoBlock }) {
      return <LiteYouTube url={block.url} title={inlineText(block.caption)} playLabel={playLabel} />
    }
  }, [labels.playVideo])

  if (unlocked) {
    return (
      <div className="mt-4">
        <RichText content={unlocked} components={{ video: Video }} labels={richTextLabels} />
      </div>
    )
  }

  return (
    <div>
      {/* Content fade into the gate (D8) */}
      <div
        aria-hidden
        className="pointer-events-none relative -mt-12 h-[72px] bg-linear-to-b from-transparent to-paper"
      />
      <div className="-mt-1.5 border border-ink bg-surface p-[22px]">
        <MonographLabel as="div" className="mb-4">
          {labels.gateLabel}
        </MonographLabel>
        <ul className="mb-5 space-y-2.5">
          {labels.benefits.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-[14px] leading-[1.5]">
              <StateGlyph state="complete" size={10} className="mt-[5px]" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <ButtonLink href={withNext('/auth/sign-up', nextPath)} variant="primary">
            {labels.createAccount}
          </ButtonLink>
          <ButtonLink href={withNext('/auth/sign-in', nextPath)} variant="ghost">
            {labels.signIn}
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
