import type { EquationBlock, InlineEquationNode } from '../schema/types'
import { renderEquationHtml } from './equation-html'

/**
 * Server-side KaTeX rendering for <RichText/> equation slots (I4 keeps
 * katex inside this package). Exported through the `./static` subpath —
 * NOT the main index — so the katex JS engine statically enters server
 * bundles only; a client module importing `@epharmatica/editor` can never
 * pull it in by accident (rules.md §9.6 reader perf budget).
 *
 * RSC surfaces (the /learn reader) inject these via
 * `components={{ equation, inlineEquation }}`: the anonymous client
 * receives finished KaTeX HTML + CSS, zero equation JavaScript.
 */

export { renderEquationHtml } from './equation-html'

/** KaTeX markup with the raw TeX as the accessible name (`output: 'html'`
 * emits no MathML, so the label carries the semantics). */
function KatexHtml({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  if (tex === '') return null
  return (
    <span role="math" aria-label={tex}>
      <span
        aria-hidden
        dangerouslySetInnerHTML={{ __html: renderEquationHtml(tex, displayMode) }}
      />
    </span>
  )
}

export function StaticEquation({ block }: { block: EquationBlock }) {
  return <KatexHtml tex={block.texExpression} displayMode />
}

export function StaticInlineEquation({ node }: { node: InlineEquationNode }) {
  return <KatexHtml tex={node.texExpression} displayMode={false} />
}
