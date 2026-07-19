import { ImageResponse } from 'next/og'
import messages from '../messages/en.json'

/*
 * Default OG image (dev-plan 0.E): paper ground, the brand mark (ink square +
 * the one permitted curve — the 45° capsule), EPHARMATICA wordmark, tagline.
 * Raw hexes are acceptable ONLY here: ImageResponse renders off-DOM, so the
 * locked light-theme values (#FBFBF9 / #0C1418 / #0E6B63) are inlined —
 * CSS custom properties do not exist inside satori.
 * Copy comes straight from messages/en.json so the catalog stays the single
 * source of truth (next-intl request context is unavailable in this route).
 */

export const alt = `${messages.common.appName} — ${messages.landing.meta.title}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const PAPER = '#FBFBF9'
const INK = '#0C1418'
const PRIMARY = '#0E6B63'

/*
 * Satori has no access to next/font, so the brand faces are fetched from
 * Google Fonts at build time (this route is statically generated). A plain
 * fetch without a browser UA gets TTF sources, which satori accepts. Any
 * failure falls back to satori's default font rather than failing the build.
 */
async function loadGoogleFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family,
    )}:wght@${weight}&text=${encodeURIComponent(text)}`
    const css = await (await fetch(cssUrl)).text()
    const url = css.match(/src:\s*url\((.+?)\)\s*format\('(?:truetype|opentype)'\)/)?.[1]
    if (!url) return null
    const res = await fetch(url)
    return res.ok ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}

export default async function OpengraphImage() {
  const displayText = `EPHARMATICA${messages.landing.hero.headline}`
  const monoText = messages.landing.hero.eyebrow
  const [archivo, plexMono] = await Promise.all([
    loadGoogleFont('Archivo', 700, displayText),
    loadGoogleFont('IBM Plex Mono', 500, monoText),
  ])
  const fonts = [
    archivo
      ? { name: 'Archivo', data: archivo, weight: 700 as const, style: 'normal' as const }
      : null,
    plexMono
      ? { name: 'IBM Plex Mono', data: plexMono, weight: 500 as const, style: 'normal' as const }
      : null,
  ].filter((f) => f !== null)

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: PAPER,
        padding: 72,
      }}
    >
      {/* Brand mark + wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div
          style={{
            width: 96,
            height: 96,
            backgroundColor: INK,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* The capsule — the system's one permitted curve (STYLE §12) */}
          <div
            style={{
              width: 56,
              height: 25,
              backgroundColor: PAPER,
              borderRadius: 999,
              transform: 'rotate(-45deg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: 2, height: 19, backgroundColor: INK }} />
          </div>
        </div>
        <div
          style={{
            fontFamily: 'Archivo',
            fontSize: 46,
            fontWeight: 700,
            letterSpacing: 3,
            color: INK,
          }}
        >
          EPHARMATICA
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontFamily: 'Archivo',
          fontSize: 62,
          fontWeight: 700,
          lineHeight: 1.08,
          letterSpacing: -1,
          color: INK,
          maxWidth: 940,
        }}
      >
        {messages.landing.hero.headline}
      </div>

      {/* Hard rule + eyebrow line */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ width: '100%', height: 2, backgroundColor: INK }} />
        <div
          style={{
            fontFamily: 'IBM Plex Mono',
            fontSize: 21,
            fontWeight: 500,
            letterSpacing: 4,
            color: PRIMARY,
          }}
        >
          {messages.landing.hero.eyebrow}
        </div>
      </div>
    </div>,
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  )
}
