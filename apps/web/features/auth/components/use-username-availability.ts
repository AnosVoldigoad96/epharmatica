'use client'

import { useEffect, useState } from 'react'
import { USERNAME_REGEX } from '@epharmatica/database'
import { checkUsernameAvailability } from '../actions'

/**
 * Live username availability (M2 §4.4): debounced ~400 ms after the user
 * stops typing, and only once the local regex passes — junk never hits the
 * network. Only completed check results live in state (set from async
 * callbacks); the visible status derives during render, so a stale result
 * for a different candidate reads as 'checking'. Action failures (rate
 * limit, unconfigured stack) fall back to 'idle': the status is a hint —
 * the mutation actions re-check server-side.
 */
export type UsernameAvailability = 'idle' | 'checking' | 'available' | 'taken'

type CheckResult = {
  candidate: string
  state: 'available' | 'taken' | 'error'
}

export function useUsernameAvailability(username: string): UsernameAvailability {
  const [result, setResult] = useState<CheckResult | null>(null)

  const candidate = username.trim().toLowerCase()
  const valid = USERNAME_REGEX.test(candidate)

  useEffect(() => {
    if (!USERNAME_REGEX.test(candidate)) {
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      checkUsernameAvailability(candidate)
        .then((checked) => {
          if (cancelled) {
            return
          }
          setResult({
            candidate,
            state: checked.ok ? (checked.available ? 'available' : 'taken') : 'error',
          })
        })
        .catch(() => {
          if (!cancelled) {
            setResult({ candidate, state: 'error' })
          }
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [candidate])

  if (!valid) {
    return 'idle'
  }
  if (result && result.candidate === candidate) {
    return result.state === 'error' ? 'idle' : result.state
  }
  return 'checking'
}
