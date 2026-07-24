import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT } from '../fixtures'
import type { Content, VideoBlock } from '../schema/types'
import { RichText } from './rich-text'

const render = (content: Content, props?: Partial<Parameters<typeof RichText>[0]>) =>
  renderToStaticMarkup(<RichText content={content} {...props} />)

describe('<RichText/> (rules.md §6.4 — full block schema)', () => {
  it('matches the full-coverage fixture snapshot', () => {
    expect(render(FIXTURE_DOCUMENT)).toMatchSnapshot()
  })

  it('stamps data-block-id on every top-level block', () => {
    const html = render(FIXTURE_DOCUMENT)
    for (const block of FIXTURE_DOCUMENT) {
      expect(html).toContain(`data-block-id="${block.id}"`)
    }
  })

  it('groups consecutive flat list items into one list, nesting by indent', () => {
    const html = render(FIXTURE_DOCUMENT)
    const bullets = html.match(/<ul class="rt-list">/g) ?? []
    expect(bullets.length).toBe(2) // outer disc list + nested indent-2 list
    expect(html.match(/<ol class="rt-list">/g)?.length).toBe(1)
    // The indent-2 item nests INSIDE the preceding li.
    expect(html).toMatch(
      /fx-li-distribution"[^]*?<ul class="rt-list"><li[^>]*fx-li-distribution-detail/,
    )
  })

  it('renders the TOC from document headings with anchor links', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('href="#h-fx-h2-pharmacokinetics"')
    expect(html).toContain('href="#h-fx-h3-monitoring"')
    expect(html).toContain('id="h-fx-h2-pharmacokinetics"')
  })

  it('renders callout eyebrow labels with variant classes', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('rt-callout--warning')
    expect(html).toContain('>Warning</p>')
    expect(html).toContain('rt-callout--clinical_pearl')
    expect(html).toContain('>Clinical Pearl</p>')
  })

  it('renders marks and links', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<strong>acetylation</strong>')
    expect(html).toContain('<em>cyclooxygenase</em>')
    expect(html).toContain('<sub>2</sub>')
    expect(html).toContain('<sup>3</sup>')
    expect(html).toContain('<code>mg/day</code>')
    expect(html).toContain('<a class="rt-link" href="https://example.com/cox-pathway">')
  })

  it('renders table header cells as th with scope', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<th scope="col"><p>Indication</p></th>')
    expect(html).toContain('<td><p>75–100 mg daily</p></td>')
  })

  it('renders images with dimensions, lazy loading, and captions', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('alt="Skeletal structure of acetylsalicylic acid"')
    expect(html).toContain('width="1200"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('<figcaption>FIG 1 — Acetylsalicylic acid</figcaption>')
  })

  it('renders code lines individually with data-line markers', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('data-line="0"')
    expect(html).toContain('data-line="1"')
    expect(html).toContain('loading_dose = Vd × Cp_target')
  })

  it('renders drug card fields in roster order, skipping absent ones', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('rt-drugcard__title')
    expect(html).toContain('data-field="adverse_effects"')
    expect(html).not.toContain('data-field="monitoring"')
    expect(html.indexOf('data-field="drug_class"')).toBeLessThan(
      html.indexOf('data-field="dosing"'),
    )
  })

  it('uses the injected video component over the default placeholder', () => {
    const Facade = ({ block }: { block: VideoBlock }) => (
      <div className="lite-facade" data-url={block.url} />
    )
    const html = render(FIXTURE_DOCUMENT, { components: { video: Facade } })
    expect(html).toContain('lite-facade')
    expect(html).not.toContain('rt-video__placeholder')
  })

  it('honors label overrides (the app passes next-intl output)', () => {
    const html = render(FIXTURE_DOCUMENT, {
      labels: {
        toc: 'Fihrist',
        callouts: {
          definition: 'Tareef',
          clinical_pearl: 'Clinical Pearl',
          mnemonic: 'Mnemonic',
          exam_alert: 'Exam Alert',
          warning: 'Intibah',
        },
      },
    })
    expect(html).toContain('aria-label="Fihrist"')
    expect(html).toContain('>Intibah</p>')
  })
})
