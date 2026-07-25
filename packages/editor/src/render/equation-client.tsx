'use client'

import { useEffect, useState } from 'react'

import type { EquationBlock, InlineEquationNode } from '../schema/types'

/**
 * Lazy client-side equation rendering for surfaces that hydrate stored
 * blocks in the browser — the member-unlock path (D8), whose gated blocks
 * arrive from a server action as JSON and render through the client-side
 * <RichText/>. The katex engine (wrapped in equation-html.ts) loads via
 * dynamic import ONLY when an equation node actually mounts: shared /learn
 * chunks contain no katex code at all — not even the renderToString call
 * site — and unlocked documents without equations never fetch the chunk.
 * Until it resolves (one microtask after mount, cached thereafter) the raw
 * TeX source shows — the same dependency-free fallback <RichText/>
 * defaults to.
 */

type RenderEquationHtml = typeof import('./equation-html').renderEquationHtml

let rendererPromise: Promise<RenderEquationHtml> | null = null

const loadRenderer = (): Promise<RenderEquationHtml> => {
  rendererPromise ??= import('./equation-html').then((mod) => mod.renderEquationHtml)
  return rendererPromise
}

function useEquationHtml(tex: string, displayMode: boolean): string | null {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    if (tex === '') {
      setHtml(null)
      return
    }
    let cancelled = false
    void loadRenderer().then((renderEquationHtml) => {
      if (cancelled) return
      setHtml(renderEquationHtml(tex, displayMode))
    })
    return () => {
      cancelled = true
    }
  }, [tex, displayMode])
  return html
}

function LazyKatexHtml({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  const html = useEquationHtml(tex, displayMode)
  if (tex === '') return null
  if (html === null) return <code>{tex}</code>
  return (
    <span role="math" aria-label={tex}>
      <span aria-hidden dangerouslySetInnerHTML={{ __html: html }} />
    </span>
  )
}

export function ClientEquation({ block }: { block: EquationBlock }) {
  return <LazyKatexHtml tex={block.texExpression} displayMode />
}

export function ClientInlineEquation({ node }: { node: InlineEquationNode }) {
  return <LazyKatexHtml tex={node.texExpression} displayMode={false} />
}
