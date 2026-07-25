'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'

/**
 * Lazy study-layer gate (1.D). The reader shells are static anonymous
 * pages under a hard JS budget (M1 §11.8) — this tiny client component is
 * all they ship: it checks for a session with the browser client (the
 * member-unlock/header-menu pattern) and only THEN renders the dynamic
 * import, so the whole study chunk (anchors, painting, popovers, drawer)
 * is fetched exclusively by signed-in visitors. Anonymous users download
 * nothing and see no study affordances.
 */

const StudyLayer = dynamic(() => import('@/features/study/components/study-layer'), {
  ssr: false,
})

export function StudyLayerMount({ subtopicId }: { subtopicId: string }) {
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        if (!cancelled && data.session) setSignedIn(true)
      } catch {
        // Env unset / network hiccup: stay anonymous — no layer.
      }
    }
    void check()
    return () => {
      cancelled = true
    }
  }, [])

  if (!signedIn) return null
  return <StudyLayer subtopicId={subtopicId} />
}
