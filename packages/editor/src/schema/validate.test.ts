import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT } from '../fixtures'
import { validateContent } from './validate'

const validParagraph = {
  id: 'b1',
  type: 'p',
  children: [{ text: 'Hello' }],
}

describe('validateContent', () => {
  it('accepts the full-coverage fixture document', () => {
    const result = validateContent(FIXTURE_DOCUMENT)
    expect(result).toEqual({ ok: true, content: FIXTURE_DOCUMENT })
  })

  it('accepts an empty document', () => {
    expect(validateContent([]).ok).toBe(true)
  })

  it('rejects non-array payloads', () => {
    expect(validateContent({}).ok).toBe(false)
    expect(validateContent('[]').ok).toBe(false)
    expect(validateContent(null).ok).toBe(false)
  })

  it('rejects unknown block types', () => {
    const result = validateContent([{ id: 'b1', type: 'marquee', children: [{ text: 'no' }] }])
    expect(result.ok).toBe(false)
  })

  it('rejects blocks without a stable id', () => {
    expect(validateContent([{ type: 'p', children: [{ text: 'x' }] }]).ok).toBe(false)
    expect(validateContent([{ ...validParagraph, id: '' }]).ok).toBe(false)
  })

  it('rejects unknown props on text nodes (strict schema)', () => {
    const result = validateContent([{ id: 'b1', type: 'p', children: [{ text: 'x', glow: true }] }])
    expect(result.ok).toBe(false)
  })

  it('accepts the v1 legacy flat-list spelling (stored rows must load)', () => {
    const result = validateContent([
      { id: 'li', type: 'p', listStyleType: 'disc', indent: 2, children: [{ text: 'item' }] },
    ])
    expect(result.ok).toBe(true)
  })

  it('accepts v2 marks and bounded CSS values; rejects unbounded ones', () => {
    const good = validateContent([
      {
        id: 'b1',
        type: 'p',
        children: [
          { text: 'x', highlight: true, kbd: true },
          { text: 'y', color: '#b91c1c', backgroundColor: 'rgb(1, 2, 3)', fontSize: '18px' },
        ],
      },
    ])
    expect(good.ok).toBe(true)
    expect(
      validateContent([
        { id: 'b1', type: 'p', children: [{ text: 'x', color: 'url(javascript:alert(1))' }] },
      ]).ok,
    ).toBe(false)
    expect(
      validateContent([{ id: 'b1', type: 'p', children: [{ text: 'x', fontSize: '10vw' }] }]).ok,
    ).toBe(false)
  })

  it('accepts align/lineHeight/indent within bounds; rejects out-of-range', () => {
    expect(
      validateContent([
        {
          id: 'b1',
          type: 'p',
          align: 'justify',
          lineHeight: 1.2,
          indent: 3,
          children: [{ text: 'x' }],
        },
      ]).ok,
    ).toBe(true)
    expect(
      validateContent([{ id: 'b1', type: 'p', align: 'start', children: [{ text: 'x' }] }]).ok,
    ).toBe(false)
    expect(
      validateContent([{ id: 'b1', type: 'p', lineHeight: 9, children: [{ text: 'x' }] }]).ok,
    ).toBe(false)
    expect(
      validateContent([{ id: 'b1', type: 'p', indent: 0, children: [{ text: 'x' }] }]).ok,
    ).toBe(false)
  })

  it('validates container lists strictly: li = one lic + optional nested list, no li ids', () => {
    const good = validateContent([
      {
        id: 'l1',
        type: 'ul',
        children: [
          {
            type: 'li',
            children: [
              { type: 'lic', children: [{ text: 'a' }] },
              {
                type: 'ol',
                children: [{ type: 'li', children: [{ type: 'lic', children: [{ text: 'b' }] }] }],
              },
            ],
          },
        ],
      },
    ])
    expect(good.ok).toBe(true)
    // li ids never store.
    expect(
      validateContent([
        {
          id: 'l1',
          type: 'ul',
          children: [
            { id: 'sneaky', type: 'li', children: [{ type: 'lic', children: [{ text: 'a' }] }] },
          ],
        },
      ]).ok,
    ).toBe(false)
    // li must start with a lic.
    expect(
      validateContent([
        {
          id: 'l1',
          type: 'ul',
          children: [
            {
              type: 'li',
              children: [
                {
                  type: 'ul',
                  children: [
                    { type: 'li', children: [{ type: 'lic', children: [{ text: 'a' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ]).ok,
    ).toBe(false)
  })

  it('validates toggles, hr, and inline dates', () => {
    expect(
      validateContent([
        { id: 't1', type: 'toggle', children: [{ text: 'More' }] },
        { id: 'h1', type: 'hr', children: [{ text: '' }] },
        {
          id: 'p1',
          type: 'p',
          children: [{ type: 'date', date: '2026-07-24', children: [{ text: '' }] }],
        },
      ]).ok,
    ).toBe(true)
    expect(
      validateContent([
        {
          id: 'p1',
          type: 'p',
          children: [{ type: 'date', date: '24/07/2026', children: [{ text: '' }] }],
        },
      ]).ok,
    ).toBe(false)
  })

  it('validates column groups: 2-4 columns, % widths, id-less children', () => {
    const column = (text: string) => ({
      type: 'column',
      width: '50%',
      children: [{ type: 'p', children: [{ text }] }],
    })
    expect(
      validateContent([{ id: 'c1', type: 'column_group', children: [column('a'), column('b')] }])
        .ok,
    ).toBe(true)
    // One column is not a group.
    expect(validateContent([{ id: 'c1', type: 'column_group', children: [column('a')] }]).ok).toBe(
      false,
    )
    // Widths must be percentages.
    expect(
      validateContent([
        {
          id: 'c1',
          type: 'column_group',
          children: [
            {
              type: 'column',
              width: '300px',
              children: [{ type: 'p', children: [{ text: 'a' }] }],
            },
            column('b'),
          ],
        },
      ]).ok,
    ).toBe(false)
    // Nested blocks never carry ids.
    expect(
      validateContent([
        {
          id: 'c1',
          type: 'column_group',
          children: [
            { type: 'column', children: [{ id: 'x', type: 'p', children: [{ text: 'a' }] }] },
            column('b'),
          ],
        },
      ]).ok,
    ).toBe(false)
  })

  it('columns admit every block type except toggle/column_group (2026-07-26 amendment)', () => {
    const partner = {
      type: 'column',
      width: '50%',
      children: [{ type: 'p', children: [{ text: 'partner' }] }],
    }
    const group = (children: unknown[]) => [
      { id: 'c1', type: 'column_group', children: [{ type: 'column', children }, partner] },
    ]
    const img = {
      type: 'img',
      url: 'https://cdn.example.com/x.webp',
      alt: 'Diagram',
      asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
      width: 640,
      height: 480,
      caption: [{ text: 'FIG — diagram' }],
      children: [{ text: '' }],
    }
    const video = {
      type: 'video',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      caption: [{ text: 'VIDEO — walkthrough' }],
      children: [{ text: '' }],
    }
    // Media + outline-ish blocks, all id-less: legal column children now.
    expect(validateContent(group([img, video])).ok).toBe(true)
    expect(
      validateContent(
        group([
          { type: 'h2', children: [{ text: 'Column heading' }] },
          { type: 'h3', children: [{ text: 'Sub' }], align: 'center' },
          { type: 'equation', texExpression: 'E = mc^2', children: [{ text: '' }] },
          { type: 'toc', children: [{ text: '' }] },
          { type: 'hr', children: [{ text: '' }] },
          { type: 'drug_card', fields: { generic_name: 'Aspirin' }, children: [{ text: '' }] },
        ]),
      ).ok,
    ).toBe(true)
    // Column children stay id-less — an id on a nested img rejects.
    expect(validateContent(group([{ ...img, id: 'sneaky' }])).ok).toBe(false)
    // Strictness holds inside columns — unknown props reject.
    expect(validateContent(group([{ ...img, zoomable: true }])).ok).toBe(false)
    // Media rules hold inside columns — video caption stays mandatory.
    expect(validateContent(group([{ ...video, caption: [{ text: '  ' }] }])).ok).toBe(false)
    // Toggle is top-level-only (indent containment model).
    expect(validateContent(group([{ type: 'toggle', children: [{ text: 'More' }] }])).ok).toBe(
      false,
    )
    // Layout never recurses — no column_group inside a column.
    expect(
      validateContent(
        group([
          {
            type: 'column_group',
            children: [
              { type: 'column', children: [{ type: 'p', children: [{ text: 'a' }] }] },
              { type: 'column', children: [{ type: 'p', children: [{ text: 'b' }] }] },
            ],
          },
        ]),
      ).ok,
    ).toBe(false)
  })

  it('validates equations: bounded texExpression on block and inline voids', () => {
    expect(
      validateContent([
        {
          id: 'eq1',
          type: 'equation',
          texExpression: 'E = mc^2',
          children: [{ text: '' }],
        },
        {
          id: 'p1',
          type: 'p',
          children: [
            { text: 'where ' },
            { type: 'inline_equation', texExpression: 'c', children: [{ text: '' }] },
          ],
        },
      ]).ok,
    ).toBe(true)
    // Empty TeX is a legal placeholder block.
    expect(
      validateContent([
        { id: 'eq1', type: 'equation', texExpression: '', children: [{ text: '' }] },
      ]).ok,
    ).toBe(true)
    // The 2000-char bound holds on both spellings.
    const oversized = 'x'.repeat(2001)
    expect(
      validateContent([
        { id: 'eq1', type: 'equation', texExpression: oversized, children: [{ text: '' }] },
      ]).ok,
    ).toBe(false)
    expect(
      validateContent([
        {
          id: 'p1',
          type: 'p',
          children: [
            { type: 'inline_equation', texExpression: oversized, children: [{ text: '' }] },
          ],
        },
      ]).ok,
    ).toBe(false)
    // texExpression is required; strictness rejects extra props.
    expect(validateContent([{ id: 'eq1', type: 'equation', children: [{ text: '' }] }]).ok).toBe(
      false,
    )
    expect(
      validateContent([
        {
          id: 'eq1',
          type: 'equation',
          texExpression: 'x',
          displayMode: true,
          children: [{ text: '' }],
        },
      ]).ok,
    ).toBe(false)
    // Columns host id-less block equations (2026-07-26 amendment) — but
    // ids still never nest.
    expect(
      validateContent([
        {
          id: 'c1',
          type: 'column_group',
          children: [
            {
              type: 'column',
              children: [{ type: 'equation', texExpression: 'x', children: [{ text: '' }] }],
            },
            { type: 'column', children: [{ type: 'p', children: [{ text: 'b' }] }] },
          ],
        },
      ]).ok,
    ).toBe(true)
    expect(
      validateContent([
        {
          id: 'c1',
          type: 'column_group',
          children: [
            {
              type: 'column',
              children: [
                { id: 'eq-x', type: 'equation', texExpression: 'x', children: [{ text: '' }] },
              ],
            },
            { type: 'column', children: [{ type: 'p', children: [{ text: 'b' }] }] },
          ],
        },
      ]).ok,
    ).toBe(false)
  })

  it('validates table cell spans within bounds', () => {
    const table = (cell: Record<string, unknown>) => [
      {
        id: 't1',
        type: 'table',
        children: [{ type: 'tr', children: [cell] }],
      },
    ]
    expect(
      validateContent(
        table({
          type: 'td',
          colSpan: 2,
          rowSpan: 2,
          children: [{ type: 'p', children: [{ text: 'x' }] }],
        }),
      ).ok,
    ).toBe(true)
    expect(
      validateContent(
        table({ type: 'td', colSpan: 999, children: [{ type: 'p', children: [{ text: 'x' }] }] }),
      ).ok,
    ).toBe(false)
  })

  it('rejects h1 — reserved for the page title', () => {
    expect(validateContent([{ id: 'b1', type: 'h1', children: [{ text: 'x' }] }]).ok).toBe(false)
  })

  it('rejects video blocks with non-YouTube URLs (M1 §9)', () => {
    const result = validateContent([
      {
        id: 'v1',
        type: 'video',
        url: 'https://vimeo.com/12345678',
        caption: [{ text: 'cap' }],
        children: [{ text: '' }],
      },
    ])
    expect(result.ok).toBe(false)
  })

  it('rejects video blocks with a blank caption (mandatory, M1 §5.3)', () => {
    const base = {
      id: 'v1',
      type: 'video',
      url: 'https://youtu.be/dQw4w9WgXcQ',
      children: [{ text: '' }],
    }
    expect(validateContent([{ ...base, caption: [{ text: '   ' }] }]).ok).toBe(false)
    expect(validateContent([{ ...base, caption: [] }]).ok).toBe(false)
  })

  it('accepts every supported YouTube URL form', () => {
    const forms = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    ]
    for (const url of forms) {
      const result = validateContent([
        { id: 'v1', type: 'video', url, caption: [{ text: 'cap' }], children: [{ text: '' }] },
      ])
      expect(result.ok, url).toBe(true)
    }
  })

  it('rejects images without alt text (a11y floor)', () => {
    const result = validateContent([
      {
        id: 'i1',
        type: 'img',
        url: 'https://cdn.example.com/x.webp',
        alt: '   ',
        asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
        width: 10,
        height: 10,
        children: [{ text: '' }],
      },
    ])
    expect(result.ok).toBe(false)
  })

  it('rejects images without dimensions (zero-CLS budget)', () => {
    const result = validateContent([
      {
        id: 'i1',
        type: 'img',
        url: 'https://cdn.example.com/x.webp',
        alt: 'x',
        asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
        children: [{ text: '' }],
      },
    ])
    expect(result.ok).toBe(false)
  })

  it('validates carousels: ≥ 1 slide data-objects on the img media contract', () => {
    const slide = {
      asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
      url: 'https://cdn.example.com/step-1.webp',
      alt: 'Step one',
      width: 640,
      height: 480,
      caption: [{ text: 'STEP 1' }],
    }
    const base = { id: 'car1', type: 'carousel', children: [{ text: '' }] }
    expect(validateContent([{ ...base, images: [slide] }]).ok).toBe(true)
    // A caption-less slide is fine (caption is optional, unlike video).
    const { caption: _cap, ...bare } = slide
    expect(validateContent([{ ...base, images: [bare] }]).ok).toBe(true)
    // Empty strips never store — the serializer drops them before this.
    expect(validateContent([{ ...base, images: [] }]).ok).toBe(false)
    expect(validateContent([{ ...base }]).ok).toBe(false)
    // The img floors hold per slide: alt (a11y), uuid asset, dimensions (CLS).
    expect(validateContent([{ ...base, images: [{ ...slide, alt: '   ' }] }]).ok).toBe(false)
    expect(validateContent([{ ...base, images: [{ ...slide, asset_id: 'not-a-uuid' }] }]).ok).toBe(
      false,
    )
    expect(validateContent([{ ...base, images: [{ ...slide, url: 'not-a-url' }] }]).ok).toBe(false)
    expect(validateContent([{ ...base, images: [{ ...slide, width: 0 }] }]).ok).toBe(false)
    // Strictness reaches into slides — unknown props reject.
    expect(validateContent([{ ...base, images: [{ ...slide, zoomable: true }] }]).ok).toBe(false)
    // Slides are data, not child nodes — children stays the void tuple.
    expect(validateContent([{ ...base, images: [slide], children: [{ text: 'stray' }] }]).ok).toBe(
      false,
    )
  })

  it('carousels are legal id-less column children (COLUMN_CHILD_TYPES)', () => {
    const slide = {
      asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
      url: 'https://cdn.example.com/step-1.webp',
      alt: 'Step one',
      width: 640,
      height: 480,
    }
    const group = (carousel: Record<string, unknown>) => [
      {
        id: 'c1',
        type: 'column_group',
        children: [
          { type: 'column', children: [carousel] },
          { type: 'column', children: [{ type: 'p', children: [{ text: 'partner' }] }] },
        ],
      },
    ]
    const idless = { type: 'carousel', images: [slide], children: [{ text: '' }] }
    expect(validateContent(group(idless)).ok).toBe(true)
    // Ids never nest — the group is the one anchor unit.
    expect(validateContent(group({ ...idless, id: 'sneaky' })).ok).toBe(false)
    // Slide rules hold inside columns too.
    expect(validateContent(group({ ...idless, images: [] })).ok).toBe(false)
  })

  it('rejects callouts with unknown variants', () => {
    const result = validateContent([
      {
        id: 'c1',
        type: 'callout',
        variant: 'fun_fact',
        children: [{ type: 'p', children: [{ text: 'x' }] }],
      },
    ])
    expect(result.ok).toBe(false)
  })

  it('rejects drug cards without generic_name and with unknown fields', () => {
    const base = { id: 'd1', type: 'drug_card', children: [{ text: '' }] }
    expect(validateContent([{ ...base, fields: { brand_names: 'X' } }]).ok).toBe(false)
    expect(
      validateContent([{ ...base, fields: { generic_name: 'X', street_names: 'nope' } }]).ok,
    ).toBe(false)
  })

  it('reports issue paths in error messages', () => {
    const result = validateContent([{ id: 'b1', type: 'p', children: [] }])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((message) => message.includes('0.children'))).toBe(true)
    }
  })
})
