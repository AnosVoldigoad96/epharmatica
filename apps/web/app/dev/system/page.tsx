import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SystemShowcase } from './showcase'

export const metadata: Metadata = {
  title: 'System primitives',
}

// Render per request so the ENABLE_DEV_SYSTEM gate below reads the runtime
// environment — statically prerendered, the decision would be baked at build.
export const dynamic = 'force-dynamic'

/**
 * /dev/system — internal tooling route (STYLE.md §16 S11, ships Phase 0):
 * renders every one of the 13 system primitives in both themes against live
 * tokens. Not a product route; hardcoded English is deliberate.
 */
export default function DevSystemPage() {
  // Env gate for now. The real admin-role gate lands with M4 (dev-plan 0.C
  // specifies /dev/system as admin-gated once roles exist).
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEV_SYSTEM !== '1') {
    notFound()
  }

  return <SystemShowcase />
}
