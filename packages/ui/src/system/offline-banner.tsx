'use client'

import { useEffect, useState } from 'react'

/**
 * OfflineBanner — full-width strip under the top bar (STYLE.md §11).
 * warn-tinted background (no warn-tint token exists, so warn at 10% alpha),
 * mono label OFFLINE + one sentence. Renders nothing while online and
 * nothing during SSR/first paint (state starts null); listens to the
 * online/offline window events after mount.
 */
export type OfflineBannerProps = {
  message?: string
}

export function OfflineBanner({
  message = "Changes will sync when you're back online.",
}: OfflineBannerProps) {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const handleOffline = () => setOnline(false)
    const handleOnline = () => setOnline(true)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (online !== false) return null

  return (
    <div role="status" className="flex w-full items-baseline gap-3 bg-warn/10 px-4 py-2">
      {/* Label stays ink — text-warn on the warn/10 fill misses the §15 AA
          floor in light theme; the strip's tint carries the status. */}
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink">
        Offline
      </span>
      <span className="text-[13.5px] text-ink-2">{message}</span>
    </div>
  )
}
