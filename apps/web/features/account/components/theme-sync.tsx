'use client'

import { useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import type { Theme } from '@epharmatica/database'

/**
 * ThemeSync — makes the account-stored theme pref win over the device-local
 * next-themes value (M2 §4.6: prefs follow the account across devices).
 * One-shot on mount (ref-guarded): if the stored pref differs from the
 * active theme, adopt it. After that the appearance controls own the value —
 * re-renders never fight the user.
 */
export function ThemeSync({ theme }: { theme: Theme }) {
  const { theme: activeTheme, setTheme } = useTheme()
  const synced = useRef(false)

  useEffect(() => {
    if (synced.current) {
      return
    }
    synced.current = true
    if (activeTheme !== theme) {
      setTheme(theme)
    }
  }, [activeTheme, setTheme, theme])

  return null
}
