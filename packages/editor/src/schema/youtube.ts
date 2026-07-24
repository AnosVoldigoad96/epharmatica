/**
 * YouTube URL handling for video blocks. A video block with an unparseable
 * URL fails validation at save (M1 §9 — CMS contract); playback always goes
 * through the privacy domain (youtube-nocookie.com, M1 §5.3).
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** Extracts the 11-char video id from any supported YouTube URL form. */
export function parseYouTubeUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

  const host = parsed.hostname.replace(/^www\.|^m\./, '')
  let candidate: string | null = null

  if (host === 'youtu.be') {
    candidate = parsed.pathname.slice(1).split('/')[0] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (parsed.pathname === '/watch') {
      candidate = parsed.searchParams.get('v')
    } else if (
      (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') &&
      segments[1]
    ) {
      candidate = segments[1]
    }
  }

  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null
}

/** Privacy-domain embed URL for the lite facade's click-to-load iframe. */
export function youTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`
}

/** Static thumbnail for the facade — the only asset fetched before click. */
export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}
