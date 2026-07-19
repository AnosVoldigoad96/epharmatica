'use client'

import { useEffect, useState } from 'react'

/**
 * ReadingBar — reading progress (STYLE.md §8 S8).
 * Fixed 2px primary bar at the top of the viewport, transform-scaled by
 * scroll from the inline start; hidden entirely when the content fits one
 * viewport. rAF-throttled scroll listener; measures the document by default,
 * or the element with `targetId`.
 */
export type ReadingBarProps = {
  targetId?: string
}

export function ReadingBar({ targetId }: ReadingBarProps) {
  const [progress, setProgress] = useState<number | null>(null)

  useEffect(() => {
    let raf = 0

    const measure = () => {
      raf = 0
      let total: number
      let scrolled: number
      if (targetId) {
        const el = document.getElementById(targetId)
        if (!el) {
          setProgress(null)
          return
        }
        const rect = el.getBoundingClientRect()
        total = rect.height - window.innerHeight
        scrolled = -rect.top
      } else {
        total = document.documentElement.scrollHeight - window.innerHeight
        scrolled = window.scrollY
      }
      if (total <= 1) {
        // Content fits one viewport — the bar hides entirely.
        setProgress(null)
        return
      }
      setProgress(Math.min(1, Math.max(0, scrolled / total)))
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [targetId])

  if (progress === null) return null

  return (
    <div
      aria-hidden
      className="fixed start-0 end-0 top-0 z-[var(--z-sticky)] h-0.5 origin-left bg-primary rtl:origin-right"
      style={{ transform: `scaleX(${progress})` }}
    />
  )
}
