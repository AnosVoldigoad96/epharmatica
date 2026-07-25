'use client'

import { useState } from 'react'
import { parseYouTubeUrl, youTubeEmbedUrl, youTubeThumbnailUrl } from '@epharmatica/editor'
import { EVENTS } from '@/lib/observability/events'

/**
 * Lite YouTube facade (M1 §5.3): until click, the only asset fetched is the
 * static thumbnail — ink ground, paper play button; click swaps in the
 * youtube-nocookie iframe. aspect-ratio 16/9 is declared on both states, so
 * the swap (and load) is zero-CLS. The mandatory caption is NOT rendered
 * here — <RichText/> owns the figcaption under the figure.
 */
export function LiteYouTube({
  url,
  title,
  playLabel,
}: {
  url: string
  /** Plain-text caption — labels the iframe and the play control. */
  title: string
  playLabel: string
}) {
  const [playing, setPlaying] = useState(false)
  const videoId = parseYouTubeUrl(url)

  // Unparseable URLs fail validation at save (M1 §9) — this is a pure
  // belt-and-braces fallback for legacy rows.
  if (!videoId) {
    return (
      <a className="rt-link" href={url}>
        {title || url}
      </a>
    )
  }

  if (playing) {
    return (
      <iframe
        src={`${youTubeEmbedUrl(videoId)}?autoplay=1`}
        title={title || playLabel}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full border-0 bg-ink"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      // M1 §10: video_played fires declaratively on the facade's one click.
      data-umami-event={EVENTS.video_played}
      aria-label={title ? `${playLabel} — ${title}` : playLabel}
      className="group relative block aspect-video w-full cursor-pointer overflow-hidden border-0 bg-ink p-0"
    >
      {/* Decorative poster — the caption below the figure carries the name. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- the facade's whole point is ONE static i.ytimg.com fetch; the optimizer would proxy a third-party host for a fixed-size poster */}
      <img
        src={youTubeThumbnailUrl(videoId)}
        alt=""
        loading="lazy"
        className="absolute inset-0 size-full object-cover opacity-80"
      />
      <span className="absolute inset-0 m-auto flex h-12 w-[72px] items-center justify-center bg-paper text-ink group-hover:bg-primary group-hover:text-on-primary group-active:bg-primary group-active:text-on-primary">
        <svg aria-hidden viewBox="0 0 12 14" className="h-3.5 w-3 fill-current rtl:-scale-x-100">
          <path d="M0 0l12 7-12 7z" />
        </svg>
      </span>
    </button>
  )
}
