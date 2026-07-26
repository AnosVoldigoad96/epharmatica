import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT, LEGACY_FLAT_LIST_DOCUMENT } from '../fixtures'
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

  it('renders v2 container lists with nesting and ONE data-block-id', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<ul class="rt-list" data-block-id="fx-ul-absorption">')
    expect(html).toContain('<ol class="rt-list" data-block-id="fx-ol-steps">')
    // The nested list renders INSIDE the second li, without its own id.
    expect(html).toMatch(
      /protein-bound<\/strong><ul class="rt-list"><li>Albumin binding ~90%<\/li><\/ul><\/li>/,
    )
  })

  it('DUAL-READ: legacy flat list items group into containers, keeping per-item anchor ids', () => {
    const html = render(LEGACY_FLAT_LIST_DOCUMENT)
    // The container takes the first item's id…
    expect(html).toContain('<ul class="rt-list" data-block-id="lg-li-absorption">')
    expect(html).toContain('<ol class="rt-list" data-block-id="lg-ol-step-1">')
    // …and every v1 item keeps its own data-block-id on its li.
    expect(html).toContain('<li data-block-id="lg-li-distribution">')
    expect(html).toContain('<li data-block-id="lg-ol-step-2">')
    // The indent-2 item nests INSIDE the preceding li.
    expect(html).toMatch(
      /lg-li-distribution"[^]*?<ul class="rt-list"><li data-block-id="lg-li-distribution-detail"/,
    )
    // No flat paragraphs remain.
    expect(html).not.toContain('<p data-block-id="lg-li-absorption">')
  })

  it('renders toggles as <details> wrapping their indented contents', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain(
      '<details data-block-id="fx-toggle-details" class="rt-toggle"><summary>Advanced: salicylate kinetics</summary>',
    )
    // The indented body blocks live inside the details, ids intact.
    expect(html).toMatch(/<details[^>]*fx-toggle-details[^]*?fx-toggle-body-p[^]*?<\/details>/)
    expect(html).toMatch(/<details[^>]*fx-toggle-details[^]*?fx-toggle-body-ul[^]*?<\/details>/)
  })

  it('renders column groups as flex columns with width bases', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<div data-block-id="fx-columns" class="rt-columns">')
    expect(html.match(/rt-columns__col/g)?.length).toBe(2)
    expect(html).toContain('style="flex-basis:50%"')
    // Column children carry no block ids.
    expect(html).toContain('<p>COX-1: constitutive, gastric protection.</p>')
  })

  it('renders images and videos inside columns via the shared figure path', () => {
    const mediaColumns: Content = [
      { id: 'h-top', type: 'h2', children: [{ text: 'Top heading' }] },
      {
        id: 'cols-media',
        type: 'column_group',
        children: [
          {
            type: 'column',
            width: '50%',
            children: [
              {
                type: 'img',
                url: 'https://cdn.example.com/x.webp',
                alt: 'Diagram',
                asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
                width: 640,
                height: 480,
                caption: [{ text: 'FIG — diagram' }],
                children: [{ text: '' }],
              },
            ],
          },
          {
            type: 'column',
            width: '50%',
            children: [
              {
                type: 'video',
                url: 'https://youtu.be/dQw4w9WgXcQ',
                caption: [{ text: 'VIDEO — walkthrough' }],
                children: [{ text: '' }],
              },
              { type: 'h3', children: [{ text: 'Column heading' }] },
              { type: 'equation', texExpression: 'E = mc^2', children: [{ text: '' }] },
              { type: 'toc', children: [{ text: '' }] },
            ],
          },
        ],
      },
    ]
    const html = render(mediaColumns)
    expect(html).toMatchSnapshot()
    // Media renders through the same figure/caption path as top-level.
    expect(html).toContain('alt="Diagram"')
    expect(html).toContain('<figcaption>FIG — diagram</figcaption>')
    expect(html).toContain('<figcaption>VIDEO — walkthrough</figcaption>')
    // Column children carry no data-block-id (id-less by schema)…
    expect(html).toContain('<figure class="rt-figure">')
    expect(html).toContain('<figure class="rt-video">')
    // …and a column heading gets no anchor id.
    expect(html).toContain('<h3>Column heading</h3>')
    // The in-column TOC tolerates id-less headings: it lists TOP-LEVEL
    // headings only, and renders without a data-block-id of its own.
    expect(html).toContain('<nav class="rt-toc"')
    expect(html).toContain('href="#h-h-top"')
    expect(html).not.toContain('#h-undefined')
    expect(html).not.toContain('Column heading</a>')
  })

  it('renders hr, alignment, line-height, and the new marks', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<hr data-block-id="fx-hr" class="rt-hr"/>')
    expect(html).toContain('style="text-align:center;line-height:2"')
    expect(html).toContain('<mark class="rt-mark">salicylate toxicity</mark>')
    expect(html).toContain('<kbd class="rt-kbd">Ctrl</kbd>')
    expect(html).toContain('<span style="color:#b91c1c">Red flag</span>')
    expect(html).toContain('<span style="background-color:#fef08a">flagged</span>')
    expect(html).toContain('<span style="font-size:20px">enlarged</span>')
  })

  it('renders inline dates as <time> with deterministic display text', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('dateTime="2026-07-24"')
    expect(html).toContain('Jul 24, 2026')
  })

  it('renders merged table cells with their spans', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<td colSpan="2"><p>Analgesic: 300–900 mg q4–6h</p></td>')
  })

  it('renders indented non-toggle blocks with a logical margin', () => {
    const indented: Content = [
      { id: 'a', type: 'p', children: [{ text: 'top' }] },
      { id: 'b', type: 'p', indent: 2, children: [{ text: 'nudged' }] },
    ]
    const html = render(indented)
    expect(html).toContain('style="margin-inline-start:3rem"')
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

  it('matches the 2-image carousel snapshot (CSS-first scroll-snap strip)', () => {
    const carouselDoc: Content = [
      {
        id: 'car-2',
        type: 'carousel',
        images: [
          {
            asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
            url: 'https://cdn.example.com/slide-1.webp',
            alt: 'First slide',
            width: 1200,
            height: 900,
            caption: [{ text: 'FIG A — first' }],
          },
          {
            asset_id: '9e5b0d12-6a3c-4f8e-b7d1-5c4a8e2f9b02',
            url: 'https://cdn.example.com/slide-2.webp',
            alt: 'Second slide',
            width: 800,
            height: 600,
            caption: [{ text: 'FIG B — ' }, { text: 'second', bold: true }],
          },
        ],
        children: [{ text: '' }],
      },
    ]
    const html = render(carouselDoc)
    expect(html).toMatchSnapshot()
    // One block, one anchor id, generic strip markup.
    expect(html).toContain('data-block-id="car-2"')
    expect(html).toContain('class="rt-carousel"')
    expect(html.match(/rt-carousel__slide/g)?.length).toBe(2)
    // Server-rendered per-slide "i / N" chips — no JS anywhere.
    expect(html).toContain('>1 / 2</span>')
    expect(html).toContain('>2 / 2</span>')
    // FIG-style captions under each image, marks intact.
    expect(html).toContain('<figcaption>FIG A — first</figcaption>')
    expect(html).toContain('<figcaption>FIG B — <strong>second</strong></figcaption>')
    // First slide eager, the rest lazy; dimensions declared (zero CLS).
    expect(html.match(/loading="lazy"/g)?.length).toBe(1)
    expect(html.indexOf('slide-1.webp')).toBeLessThan(html.indexOf('loading="lazy"'))
    expect(html).toContain('width="1200"')
    expect(html).toContain('aspect-ratio:800 / 600')
  })

  it('renders the fixture carousel with all slides in order (caption-less ok)', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('data-block-id="fx-carousel-synthesis"')
    expect(html.match(/rt-carousel__slide/g)?.length).toBe(3)
    expect(html).toContain('>3 / 3</span>')
    expect(html).toContain('<figcaption>STEP 1 — Phospholipase A2</figcaption>')
    // The third slide has no caption — no empty figcaption renders for it.
    expect(html.indexOf('prostaglandin-step-1')).toBeLessThan(html.indexOf('prostaglandin-step-2'))
    expect(html.indexOf('prostaglandin-step-2')).toBeLessThan(html.indexOf('prostaglandin-step-3'))
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

  it('renders equations as raw TeX by default (dependency-free fallback)', () => {
    const html = render(FIXTURE_DOCUMENT)
    expect(html).toContain('<div data-block-id="fx-equation-henderson" class="rt-equation">')
    expect(html).toContain('<code>pH = pK_a + \\log_{10}\\frac{[A^-]}{[HA]}</code>')
    expect(html).toContain(
      '<span class="rt-inline-equation"><code>CL = k_e \\cdot V_d</code></span>',
    )
  })

  it('uses injected equation components (the app passes KaTeX renderers)', () => {
    const html = render(FIXTURE_DOCUMENT, {
      components: {
        equation: ({ block }) => <span className="katex-block" data-tex={block.texExpression} />,
        inlineEquation: ({ node }) => (
          <span className="katex-inline" data-tex={node.texExpression} />
        ),
      },
    })
    expect(html).toContain('katex-block')
    expect(html).toContain('data-tex="CL = k_e \\cdot V_d"')
    // The stable wrapper hooks stay in place around the injected markup.
    expect(html).toContain('<div data-block-id="fx-equation-henderson" class="rt-equation">')
    expect(html).toContain('<span class="rt-inline-equation"><span class="katex-inline"')
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
