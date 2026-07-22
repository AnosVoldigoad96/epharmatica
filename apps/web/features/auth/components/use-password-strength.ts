'use client'

import { useEffect, useState } from 'react'
import { passwordStrength, type PasswordScore } from '@/lib/security/password-strength'

/**
 * Debounced live zxcvbn score for the password helpers (securities.md §6).
 * The dictionaries lazy-load through lib/security/password-strength's
 * module-level promise, so nothing heavy sits in the initial bundle. Only
 * completed scores live in state (set from async callbacks); the returned
 * value derives during render — `null` while empty or still computing, and
 * the helper renders the '—' label then.
 */
type ScoreResult = { password: string; score: PasswordScore }

export function usePasswordStrength(
  password: string,
  inputs: readonly string[],
): PasswordScore | null {
  const [result, setResult] = useState<ScoreResult | null>(null)
  // Stable dependency for the caller's inline arrays.
  const inputsKey = inputs.join(' ')

  useEffect(() => {
    if (!password) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      const userInputs = inputsKey.split(' ').filter(Boolean)
      passwordStrength(password, userInputs)
        .then((scored) => {
          if (!cancelled) {
            setResult({ password, score: scored.score })
          }
        })
        .catch(() => {
          // Dictionary load failed — the helper keeps showing '—' and the
          // submit-time check (and the server) still decide.
        })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [password, inputsKey])

  if (!password) {
    return null
  }
  return result && result.password === password ? result.score : null
}
