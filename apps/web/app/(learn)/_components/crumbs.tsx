import Link from 'next/link'

/**
 * Learn breadcrumbs (reader spec): "LEARN / {SUBJECT} / …" — mono 10.5px
 * uppercase; ancestors link, the current node is plain ink text. Renders all
 * levels (M1 §4 — the topic segment is load-bearing). Server-compatible.
 */
export type CrumbItem = { label: string; href?: string }

export function Crumbs({
  items,
  ariaLabel,
  className,
}: {
  items: CrumbItem[]
  ariaLabel: string
  className?: string
}) {
  return (
    <nav aria-label={ariaLabel} className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-2">
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-center gap-x-1.5">
            {index > 0 ? <span aria-hidden>/</span> : null}
            {item.href ? (
              <Link href={item.href} className="py-1 hover:text-primary hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate py-1 text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
