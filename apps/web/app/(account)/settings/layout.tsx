import type { ReactNode } from 'react'
import { SettingsNav } from '../_components/settings-nav'

/*
 * Settings shell (wireframes §5): two-column `220px 1fr` grid ≥ md — rail
 * with its hard ink end rule, content column capped at 560px. Below md the
 * rail renders as a horizontal tab row above the content (SettingsNav owns
 * both forms responsively).
 */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-content px-5 pb-12 sm:px-6 md:grid md:grid-cols-[220px_1fr] md:px-8">
      <SettingsNav />
      <div className="py-7 md:ps-8">
        {/* @container: profile-form responds to this column's width, not the viewport. */}
        <div className="@container max-w-[560px]">{children}</div>
      </div>
    </div>
  )
}
