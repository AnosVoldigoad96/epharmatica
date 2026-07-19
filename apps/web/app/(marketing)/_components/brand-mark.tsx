/**
 * Brand mark — the capsule in the box (STYLE.md §12).
 * Ink square tile containing the white 45° capsule with its seam: the system's
 * ONE permitted curve, which never leaks into UI chrome. `rounded-[999px]` is
 * deliberate — the token scale pins every --radius-* to 0px (S1), so the
 * permitted curve must bypass the tokens rather than un-pin them.
 */
const SIZE_CLASSES = {
  16: 'size-4',
  24: 'size-6',
  32: 'size-8',
} as const

export function BrandMark({
  size = 24,
  className,
}: {
  size?: keyof typeof SIZE_CLASSES
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block flex-none bg-ink ${SIZE_CLASSES[size]} ${className ?? ''}`}
    >
      <span className="absolute inset-0 m-auto h-[26%] w-[58%] -rotate-45 rounded-[999px] bg-paper">
        {/* The capsule seam */}
        <span className="absolute inset-x-0 bottom-[12%] top-[12%] mx-auto w-px bg-ink" />
      </span>
    </span>
  )
}

/** EPHARMATICA wordmark — Archivo 700, wdth 125 via font-stretch (STYLE §12). */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span
      className={`font-display text-[14px] font-bold tracking-[.02em] font-stretch-125% ${className ?? ''}`}
    >
      EPHARMATICA
    </span>
  )
}
