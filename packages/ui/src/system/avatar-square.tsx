import { cx } from '../lib/cx'

/**
 * AvatarSquare — the canvas `.avatar` (STYLE.md §12 avatar-fallback frame):
 * square, primary-tint ground, 1px primary border. Without a `src` it shows
 * mono uppercase initials (first letters of the first two words of `name`)
 * in primary-strong; with one it shows the image, `alt=''` — the avatar is
 * decorative and adjacent text carries the name. Server-compatible.
 */
export type AvatarSquareProps = {
  src?: string | null
  name: string
  size?: number
  className?: string
}

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()
}

export function AvatarSquare({ src, name, size = 40, className }: AvatarSquareProps) {
  return (
    <span
      className={cx(
        'inline-flex flex-none items-center justify-center overflow-hidden border border-primary bg-primary-tint',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        // Plain <img>: avatar URLs are user uploads served as-is — no
        // next/image inside packages/ui.
        <img src={src} alt="" width={size} height={size} className="size-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="font-mono font-medium uppercase tracking-[0.05em] text-primary-strong"
          style={{ fontSize: Math.round(size * 0.3) }}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
