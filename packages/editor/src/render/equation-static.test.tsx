import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT } from '../fixtures'
import type { EquationBlock } from '../schema/types'
import { RichText } from './rich-text'
import { StaticEquation, StaticInlineEquation, renderEquationHtml } from './equation-static'

/**
 * The server-side KaTeX path (the /learn reader architecture): equations
 * arrive at the anonymous client as finished HTML + CSS. The snapshot pins
 * the exact katex.renderToString output the reader ships.
 */

describe('renderEquationHtml (katex.renderToString, server-side)', () => {
  it('emits html-only KaTeX markup (no MathML, no katex JS needed)', () => {
    const html = renderEquationHtml('E = mc^2', false)
    expect(html).toContain('class="katex"')
    expect(html).toContain('katex-html')
    expect(html).not.toContain('<math')
    expect(html).not.toContain('katex-mathml')
  })

  it('display mode wraps in katex-display', () => {
    expect(renderEquationHtml('E = mc^2', true)).toContain('class="katex-display"')
    expect(renderEquationHtml('E = mc^2', false)).not.toContain('katex-display')
  })

  it('throwOnError:false — malformed TeX renders as visible error markup', () => {
    const html = renderEquationHtml('\\frac{1}{', true)
    expect(html).toContain('katex-error')
  })

  it('matches the fixture-document snapshot rendered through <RichText/>', () => {
    const html = renderToStaticMarkup(
      <RichText
        content={FIXTURE_DOCUMENT.filter(
          (block) => block.type === 'equation' || block.id === 'fx-p-inline-equation',
        )}
        components={{ equation: StaticEquation, inlineEquation: StaticInlineEquation }}
      />,
    )
    expect(html).toMatchSnapshot()
  })
})

describe('<StaticEquation/> / <StaticInlineEquation/>', () => {
  const block = FIXTURE_DOCUMENT.find(
    (candidate): candidate is EquationBlock => candidate.type === 'equation',
  ) as EquationBlock

  it('labels the math with the raw TeX and hides the markup from AT', () => {
    const html = renderToStaticMarkup(<StaticEquation block={block} />)
    expect(html).toContain('role="math"')
    expect(html).toContain('aria-label="pH = pK_a + \\log_{10}\\frac{[A^-]}{[HA]}"')
    expect(html).toContain('aria-hidden="true"')
  })

  it('renders nothing for an empty placeholder', () => {
    expect(
      renderToStaticMarkup(
        <StaticEquation
          block={{ id: 'eq', type: 'equation', texExpression: '', children: [{ text: '' }] }}
        />,
      ),
    ).toBe('')
    expect(
      renderToStaticMarkup(
        <StaticInlineEquation
          node={{ type: 'inline_equation', texExpression: '', children: [{ text: '' }] }}
        />,
      ),
    ).toBe('')
  })

  it('inline vs block: only the block spelling uses display mode', () => {
    const inline = renderToStaticMarkup(
      <StaticInlineEquation
        node={{ type: 'inline_equation', texExpression: 'E = mc^2', children: [{ text: '' }] }}
      />,
    )
    expect(inline).toContain('class="katex"')
    expect(inline).not.toContain('katex-display')
    const display = renderToStaticMarkup(<StaticEquation block={block} />)
    expect(display).toContain('katex-display')
  })
})
