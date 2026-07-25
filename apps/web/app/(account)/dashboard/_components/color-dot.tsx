import type { StudyHighlightColor } from '@/features/study/anchor-schema'

/**
 * 12px highlighter-color square (STYLE §3 hl tokens) — the same dot the
 * notes drawer draws. Decorative: color names are conveyed in text where
 * they matter (the My Highlights filter chips). Server-compatible.
 */
const DOT_BG: Record<StudyHighlightColor, string> = {
  amber: 'bg-hl-amber',
  mint: 'bg-hl-mint',
  lilac: 'bg-hl-lilac',
  rose: 'bg-hl-rose',
}

export function ColorDot({ color, className }: { color: StudyHighlightColor; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3 flex-none ${DOT_BG[color]} ${className ?? ''}`}
    />
  )
}
