'use client'

import { useEffect, useRef } from 'react'

/**
 * TurnstileWidget — the Cloudflare Turnstile leaf shared by the auth forms
 * (sign-up, forgot-password). The load/render/reset pattern is extracted
 * from @epharmatica/ui's WaitlistForm: the script is injected once
 * (module-level promise singleton), rendered explicitly into a div, and
 * expired/errored tokens surface as `undefined` so the server-side
 * verification decides. Bump `resetKey` after a failed submit — tokens are
 * single-use, so a retry needs a fresh one. No site key ⇒ renders nothing
 * (dev; the server skips verification too).
 */
export type TurnstileWidgetProps = {
  siteKey?: string
  onToken: (token: string | undefined) => void
  resetKey?: number
  className?: string
}

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
    },
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

// Local cast rather than a global Window augmentation — WaitlistForm already
// declares one, and duplicate ambient declarations would collide.
function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile
}

let turnstilePromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  if (getTurnstile()) {
    return Promise.resolve()
  }
  if (!turnstilePromise) {
    turnstilePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = TURNSTILE_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        turnstilePromise = null
        script.remove()
        reject(new Error('Turnstile failed to load'))
      }
      document.head.appendChild(script)
    })
  }
  return turnstilePromise
}

export function TurnstileWidget({
  siteKey,
  onToken,
  resetKey = 0,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const onTokenRef = useRef(onToken)

  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  useEffect(() => {
    if (!siteKey) {
      return
    }
    let cancelled = false
    loadTurnstile()
      .then(() => {
        const turnstile = getTurnstile()
        if (cancelled || !containerRef.current || !turnstile) {
          return
        }
        widgetIdRef.current = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(undefined),
          'error-callback': () => onTokenRef.current(undefined),
        })
      })
      .catch(() => {
        // Script blocked/unavailable — submit proceeds without a token and
        // the server-side verification decides.
      })
    return () => {
      cancelled = true
      const turnstile = getTurnstile()
      if (widgetIdRef.current && turnstile) {
        turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = undefined
      }
    }
  }, [siteKey])

  // Failed submits spent the token at siteverify — mint a fresh one.
  useEffect(() => {
    if (resetKey === 0) {
      return
    }
    const turnstile = getTurnstile()
    if (widgetIdRef.current && turnstile) {
      turnstile.reset(widgetIdRef.current)
    }
  }, [resetKey])

  if (!siteKey) {
    return null
  }
  return <div ref={containerRef} className={className} />
}
