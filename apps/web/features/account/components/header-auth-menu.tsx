'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AvatarSquare } from '@epharmatica/ui'
import { ButtonLink } from '@/app/(marketing)/_components/button-link'
import { createClient } from '@/lib/supabase/client'

/**
 * Public-header account slot. The marketing pages stay STATIC: this
 * renders the waitlist CTA at build time and swaps to the avatar menu
 * client-side once a session is found (same control height — zero CLS).
 * Menu: Admin (staff roles only) · Dashboard · Settings · Sign out (this
 * device; sign-out-everywhere lives in settings, and only it is audited —
 * M2). The Dashboard label reads its copy directly (useTranslations under
 * the root NextIntlClientProvider) — the labels prop predates that and its
 * callers are the static (marketing)/(learn) layouts.
 */

type MenuState =
  | { kind: 'anon' }
  | {
      kind: 'user'
      displayName: string
      avatarUrl: string | null
      isStaff: boolean
    }

export function HeaderAuthMenu({
  labels,
}: {
  labels: {
    joinWaitlist: string
    menuAria: string
    admin: string
    settings: string
    signOut: string
  }
}) {
  const router = useRouter()
  const tMenu = useTranslations('common.accountMenu')
  const [, startTransition] = useTransition()
  const [state, setState] = useState<MenuState>({ kind: 'anon' })
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (!data.user || cancelled) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url, role')
          .eq('id', data.user.id)
          .maybeSingle()
        if (cancelled || !profile) return
        setState({
          kind: 'user',
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
          isStaff: profile.role !== 'user',
        })
      } catch {
        // Env unset / network hiccup: keep the anonymous CTA.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (state.kind === 'anon') {
    return (
      <ButtonLink href="/#waitlist" variant="primary" size="sm">
        {labels.joinWaitlist}
      </ButtonLink>
    )
  }

  const signOut = () => {
    startTransition(async () => {
      try {
        await createClient().auth.signOut()
      } catch {
        // Cookie clear happens client-side regardless.
      }
      setOpen(false)
      setState({ kind: 'anon' })
      router.push('/')
      router.refresh()
    })
  }

  const itemClass = 'block w-full px-4 py-2 text-start text-[13.5px] text-ink hover:bg-primary-tint'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={labels.menuAria}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center outline-offset-2"
      >
        <AvatarSquare src={state.avatarUrl} name={state.displayName} size={36} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-[var(--z-dropdown)] mt-2 min-w-44 border border-ink bg-surface py-1 shadow-[0_8px_24px_rgba(12,20,24,0.16)]"
        >
          <p className="border-b border-line px-4 pb-2 pt-1.5 text-[12px] font-semibold">
            {state.displayName}
          </p>
          {state.isStaff ? (
            <Link
              role="menuitem"
              href="/admin"
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              {labels.admin}
            </Link>
          ) : null}
          <Link
            role="menuitem"
            href="/dashboard"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {tMenu('dashboard')}
          </Link>
          <Link
            role="menuitem"
            href="/settings/profile"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            {labels.settings}
          </Link>
          <button type="button" role="menuitem" className={itemClass} onClick={signOut}>
            {labels.signOut}
          </button>
        </div>
      ) : null}
    </div>
  )
}
