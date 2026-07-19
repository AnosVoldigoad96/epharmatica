'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cx } from '../lib/cx'
import { iconProps } from '../lib/icon'

/**
 * Toast — context-based, no external dep (STYLE.md §11).
 * Square, surface, 1px line border, the one overlay shadow; icon + one
 * sentence + optional single action. Bottom-center ≥ md, above the
 * action-bar zone on mobile. 5s default; variant 'error' persists until
 * dismissed; visible stack max 2 (older items queue). z toast.
 */
export type ToastOptions = {
  title: string
  icon?: LucideIcon
  variant?: 'default' | 'error'
  action?: { label: string; onSelect: () => void }
  duration?: number
}

type ToastItem = ToastOptions & { id: string }

export type ToastContextValue = {
  toast: (options: ToastOptions) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const MAX_VISIBLE = 2
const DEFAULT_DURATION = 5000

const TOAST_CSS =
  '@media (prefers-reduced-motion: no-preference){.eph-toast-in{animation:eph-toast-enter 160ms cubic-bezier(0.2,0.6,0.2,1) both}}@keyframes eph-toast-enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'

export type ToastProviderProps = { children: ReactNode }

export function ToastProvider({ children }: ToastProviderProps) {
  const [items, setItems] = useState<ReadonlyArray<ToastItem>>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((options: ToastOptions): string => {
    const id = `eph-toast-${nextId.current++}`
    setItems((prev) => [...prev, { ...options, id }])
    return id
  }, [])

  // Auto-dismiss timers start only once a toast becomes visible (not queued).
  useEffect(() => {
    for (const item of items.slice(0, MAX_VISIBLE)) {
      if (item.variant === 'error') continue // errors persist until dismissed
      if (timers.current.has(item.id)) continue
      timers.current.set(
        item.id,
        setTimeout(() => {
          timers.current.delete(item.id)
          setItems((prev) => prev.filter((t) => t.id !== item.id))
        }, item.duration ?? DEFAULT_DURATION),
      )
    }
  }, [items])

  useEffect(() => {
    const map = timers.current
    return () => {
      for (const timer of map.values()) clearTimeout(timer)
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])
  const visible = items.slice(0, MAX_VISIBLE)

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom,0px))] z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 md:bottom-6"
        role="region"
        aria-label="Notifications"
      >
        {visible.length > 0 ? <style>{TOAST_CSS}</style> : null}
        {visible.map(({ id, title, icon: Icon, variant, action }) => (
          <div
            key={id}
            role={variant === 'error' ? 'alert' : 'status'}
            className="eph-toast-in pointer-events-auto flex max-w-full items-center gap-3 border border-line bg-surface px-4 py-3 text-[14px] text-ink shadow-overlay"
          >
            {Icon ? (
              <Icon
                {...iconProps}
                className={cx('flex-none', variant === 'error' ? 'text-danger' : 'text-ink-2')}
              />
            ) : null}
            <span className="min-w-0">{title}</span>
            {/* §15 target floor: buttons keep ≥40px (44 coarse) hit areas via
                negative margins so the toast stays visually compact. */}
            {action ? (
              <button
                type="button"
                onClick={() => {
                  action.onSelect()
                  dismiss(id)
                }}
                className="-my-3 ms-1 inline-flex min-h-10 flex-none cursor-pointer items-center px-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-primary hover:text-primary-strong active:text-primary-strong [@media(pointer:coarse)]:min-h-11"
              >
                {action.label}
              </button>
            ) : null}
            {variant === 'error' ? (
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(id)}
                className="-my-3 -me-2 ms-1 inline-flex size-10 flex-none cursor-pointer items-center justify-center text-ink-2 hover:text-ink active:text-ink [@media(pointer:coarse)]:size-11"
              >
                <X {...iconProps} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
