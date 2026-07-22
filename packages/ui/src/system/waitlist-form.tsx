'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../lib/cx'
import { fieldClass } from '../form/field'
import { MonographLabel } from './monograph-label'
import { Stamp } from './stamp'

/**
 * WaitlistForm — S12 (STYLE.md §11): email + module select + role select +
 * one verb ("Join waitlist"), mono labels above fields; §6.7 on touch: one
 * column, labels above, 16px input text, correct inputmode/autocomplete.
 * Success replaces the whole form with the animated Stamp — the
 * completion-stamp language reused. Optional Cloudflare Turnstile: the
 * script is injected once and rendered explicitly into a div; the token is
 * included in the `action` payload.
 */
export type WaitlistResult = { ok: true; dateLabel: string } | { ok: false; error: string }

export type WaitlistFormProps = {
  action: (data: {
    email: string
    module: string
    role: string
    turnstileToken?: string
  }) => Promise<WaitlistResult>
  modules: ReadonlyArray<{ value: string; label: string }>
  roles: ReadonlyArray<{ value: string; label: string }>
  labels: {
    email: string
    emailPlaceholder: string
    module: string
    role: string
    submit: string
    successPrefix: string
    genericError: string
  }
  turnstileSiteKey?: string
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

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstilePromise: Promise<void> | null = null

function loadTurnstile(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
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

// §6.7 — one column on touch: field wrappers drop their row flex-basis.
const coarseColumn = '[@media(pointer:coarse)]:w-full [@media(pointer:coarse)]:flex-none'

export function WaitlistForm({
  action,
  modules,
  roles,
  labels,
  turnstileSiteKey,
}: WaitlistFormProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successDate, setSuccessDate] = useState<string | null>(null)
  const [token, setToken] = useState<string | undefined>(undefined)
  const widgetRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const successRef = useRef<HTMLParagraphElement | null>(null)

  useEffect(() => {
    if (!turnstileSiteKey) return
    let cancelled = false
    loadTurnstile()
      .then(() => {
        if (cancelled || !widgetRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(widgetRef.current, {
          sitekey: turnstileSiteKey,
          callback: (t) => setToken(t),
          'expired-callback': () => setToken(undefined),
          'error-callback': () => setToken(undefined),
        })
      })
      .catch(() => {
        // Script blocked/unavailable — submit proceeds without a token and
        // the server-side verification decides.
      })
    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = undefined
      }
    }
  }, [turnstileSiteKey])

  // The success stamp replaces the form — move focus onto it so keyboard
  // users aren't dropped, and role="status" announces it.
  useEffect(() => {
    if (successDate) successRef.current?.focus()
  }, [successDate])

  if (successDate) {
    return (
      <p role="status" tabIndex={-1} ref={successRef} className="m-0 outline-none">
        <Stamp animate>{`${labels.successPrefix} · ${successDate}`}</Stamp>
      </p>
    )
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const data = new FormData(e.currentTarget)
    setError(null)
    setPending(true)
    try {
      const result = await action({
        email: String(data.get('email') ?? ''),
        module: String(data.get('module') ?? ''),
        role: String(data.get('role') ?? ''),
        turnstileToken: token,
      })
      if (result.ok) {
        setSuccessDate(result.dateLabel)
      } else {
        setError(result.error || labels.genericError)
        resetTurnstile()
      }
    } catch {
      setError(labels.genericError)
      resetTurnstile()
    } finally {
      setPending(false)
    }
  }

  // Turnstile tokens are single-use: the failed attempt spent this one at
  // siteverify, so retrying with it would dead-end. Mint a fresh token.
  function resetTurnstile() {
    setToken(undefined)
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-stretch gap-2 [@media(pointer:coarse)]:flex-col">
        <label className={cx('flex min-w-0 flex-[2_1_200px] flex-col gap-2', coarseColumn)}>
          <MonographLabel as="span" size="sm">
            {labels.email}
          </MonographLabel>
          <input
            name="email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            placeholder={labels.emailPlaceholder}
            className={cx(fieldClass, 'placeholder:text-ink-2')}
          />
        </label>
        <label className={cx('flex min-w-0 flex-[1_1_130px] flex-col gap-2', coarseColumn)}>
          <MonographLabel as="span" size="sm">
            {labels.module}
          </MonographLabel>
          <span className="relative block">
            <select name="module" className={cx(fieldClass, 'appearance-none pe-8')}>
              {modules.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden
              className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-ink-2"
            />
          </span>
        </label>
        <label className={cx('flex min-w-0 flex-[1_1_110px] flex-col gap-2', coarseColumn)}>
          <MonographLabel as="span" size="sm">
            {labels.role}
          </MonographLabel>
          <span className="relative block">
            <select name="role" className={cx(fieldClass, 'appearance-none pe-8')}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden
              className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-ink-2"
            />
          </span>
        </label>
        <div className={cx('flex flex-[1_1_140px] flex-col justify-end', coarseColumn)}>
          <button
            type="submit"
            aria-busy={pending}
            disabled={pending}
            className="inline-flex h-10 cursor-pointer items-center justify-center border border-primary bg-primary px-4.5 font-sans text-[14px] font-medium text-on-primary hover:border-primary-strong hover:bg-primary-strong active:border-primary-strong active:bg-primary-strong disabled:cursor-default [@media(pointer:coarse)]:h-11"
          >
            {labels.submit}
          </button>
        </div>
      </div>
      {turnstileSiteKey ? <div ref={widgetRef} className="mt-3" /> : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
