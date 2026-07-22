'use client'

import { useState } from 'react'
import { Button } from '@epharmatica/ui'
import { signInWithGoogle } from '../actions'

/**
 * "Continue with Google" — a form bound to the signInWithGoogle server
 * action so the OAuth redirect happens server-side (wireframes §1–2: ghost
 * button, mono G glyph). A return value only ever means failure (env unset,
 * provider misconfigured); success redirects away.
 */
export function GoogleButton({ next, label }: { next: string; label: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    setPending(true)
    try {
      const result = await signInWithGoogle(next)
      if (result && !result.ok) {
        setError(result.error)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form action={submit}>
      <Button type="submit" variant="ghost" pending={pending} className="w-full">
        <span aria-hidden className="font-mono text-[13px] font-medium">
          G
        </span>
        {label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
