import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT, LEGACY_FLAT_LIST_DOCUMENT } from '../fixtures'
import type { ListBlock, TableBlock, TableCell } from '../schema/types'
import { fromEditorValue, toEditorValue } from './serialize'

describe('fromEditorValue (the single save path)', () => {
  it('round-trips the full-coverage fixture unchanged', () => {
    const result = fromEditorValue(FIXTURE_DOCUMENT)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toEqual(FIXTURE_DOCUMENT)
  })

  it('rejects non-array input', () => {
    const result = fromEditorValue({ not: 'an array' })
    expect(result).toEqual({ ok: false, errors: ['(root): expected an array of blocks'] })
  })

  it('strips ids from nested elements (tr/td/nested p) but keeps top-level ids', () => {
    const value = [
      {
        id: 'tbl',
        type: 'table',
        children: [
          {
            id: 'row-junk',
            type: 'tr',
            children: [
              {
                id: 'cell-junk',
                type: 'td',
                children: [{ id: 'p-junk', type: 'p', children: [{ text: 'cell' }] }],
              },
            ],
          },
        ],
      },
      {
        id: 'co',
        type: 'callout',
        variant: 'warning',
        children: [{ id: 'nested-p-junk', type: 'p', children: [{ text: 'body' }] }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'tbl',
          type: 'table',
          children: [
            {
              type: 'tr',
              children: [{ type: 'td', children: [{ type: 'p', children: [{ text: 'cell' }] }] }],
            },
          ],
        },
        {
          id: 'co',
          type: 'callout',
          variant: 'warning',
          children: [{ type: 'p', children: [{ text: 'body' }] }],
        },
      ])
    }
  })

  it('strips editor-only table sizing props but KEEPS merge spans (schema v2)', () => {
    const value = [
      {
        id: 'tbl',
        type: 'table',
        colSizes: [120, 120],
        marginLeft: 12,
        children: [
          {
            type: 'tr',
            children: [
              {
                type: 'th',
                colSpan: 2,
                rowSpan: 3,
                children: [{ type: 'p', children: [{ text: 'h' }] }],
              },
              {
                type: 'td',
                colSpan: 1,
                rowSpan: 1,
                children: [{ type: 'p', children: [{ text: 'c' }] }],
              },
            ],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Spans >= 2 persist; span 1 is the implicit default and drops.
      expect(result.content[0]).toEqual({
        id: 'tbl',
        type: 'table',
        children: [
          {
            type: 'tr',
            children: [
              {
                type: 'th',
                colSpan: 2,
                rowSpan: 3,
                children: [{ type: 'p', children: [{ text: 'h' }] }],
              },
              { type: 'td', children: [{ type: 'p', children: [{ text: 'c' }] }] },
            ],
          },
        ],
      })
    }
  })

  it('SINGLE-WRITE: v1 flat list items reaching the save path emit containers', () => {
    const value = [
      {
        id: 'a',
        type: 'p',
        listStyleType: 'disc',
        listStart: 2,
        indent: 1,
        children: [{ text: 'one' }],
      },
      { id: 'b', type: 'p', listStyleType: 'disc', indent: 2, children: [{ text: 'deep' }] },
      { id: 'c', type: 'p', indent: 3, children: [{ text: 'plain indented' }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]).toEqual({
        id: 'a',
        type: 'ul',
        children: [
          {
            type: 'li',
            children: [
              { type: 'lic', children: [{ text: 'one' }] },
              {
                type: 'ul',
                children: [
                  { type: 'li', children: [{ type: 'lic', children: [{ text: 'deep' }] }] },
                ],
              },
            ],
          },
        ],
      })
      // Generic block indent (no listStyleType) is a REAL v2 prop now.
      expect(result.content[1]).toEqual({
        id: 'c',
        type: 'p',
        indent: 3,
        children: [{ text: 'plain indented' }],
      })
    }
  })

  it("translates Plate's default subscript/superscript leaf props to sub/sup", () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [
          { text: 'H' },
          { text: '2', subscript: true },
          { text: 'O and 10' },
          { text: '3', superscript: true },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]?.children).toEqual([
        { text: 'H' },
        { text: '2', sub: true },
        { text: 'O and 10' },
        { text: '3', sup: true },
      ])
    }
  })

  it('drops non-true mark values (selection artifacts, empty strings)', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [{ text: 'x', bold: '', italic: false, underline: true, weird: true }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]?.children).toEqual([{ text: 'x', underline: true }])
    }
  })

  it('strips unknown props from blocks and links', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        __selection: { anchor: 0 },
        children: [
          { text: 'see ' },
          {
            type: 'a',
            url: 'https://example.com/x',
            target: '_blank',
            children: [{ text: 'link' }],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'p1',
          type: 'p',
          children: [
            { text: 'see ' },
            { type: 'a', url: 'https://example.com/x', children: [{ text: 'link' }] },
          ],
        },
      ])
    }
  })

  it('rejects unknown top-level block types instead of dropping content', () => {
    const result = fromEditorValue([
      { id: 'ok', type: 'p', children: [{ text: 'fine' }] },
      { id: 'bad', type: 'mystery_widget', children: [{ text: 'payload' }] },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors[0]).toContain('mystery_widget')
    }
  })

  it('coerces void children to a single empty text node', () => {
    const value = [
      {
        id: 'v1',
        type: 'video',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        caption: [{ text: 'VIDEO — mechanism' }],
        children: [{ text: 'stray editing junk', bold: true }, { text: 'more' }],
      },
      { id: 't1', type: 'toc', children: [{ text: 'junk' }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]?.children).toEqual([{ text: '' }])
      expect(result.content[1]?.children).toEqual([{ text: '' }])
    }
  })

  it('drops empty optional drug card fields and unknown field keys', () => {
    const value = [
      {
        id: 'dc',
        type: 'drug_card',
        fields: { generic_name: 'Aspirin', brand_names: '', bogus_key: 'x', dosing: '75 mg' },
        children: [{ text: '' }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]).toEqual({
        id: 'dc',
        type: 'drug_card',
        fields: { generic_name: 'Aspirin', dosing: '75 mg' },
        children: [{ text: '' }],
      })
    }
  })

  it('fails validation (not silently) when required props are broken', () => {
    // Missing top-level id + empty video caption both surface as errors.
    const result = fromEditorValue([
      { type: 'p', children: [{ text: 'no id' }] },
      {
        id: 'v',
        type: 'video',
        url: 'https://youtu.be/dQw4w9WgXcQ',
        caption: [],
        children: [{ text: '' }],
      },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0)
  })

  it('coerces empty inline children to one empty text node', () => {
    const result = fromEditorValue([{ id: 'p1', type: 'p', children: [] }])
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content[0]?.children).toEqual([{ text: '' }])
  })
})

describe('fromEditorValue — editor-v2 artifacts (slash / dnd / selection)', () => {
  it('drops an open slash_input element mid-paragraph (empty query)', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [
          { text: 'dose ' },
          { type: 'slash_input', children: [{ text: '' }] },
          { text: ' daily' },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'p1', type: 'p', children: [{ text: 'dose ' }, { text: ' daily' }] },
      ])
    }
  })

  it('unwraps a slash_input carrying query text instead of losing it', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [{ text: 'see ' }, { type: 'slash_input', children: [{ text: 'tabl' }] }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'p1', type: 'p', children: [{ text: 'see ' }, { text: 'tabl' }] },
      ])
    }
  })

  it('keeps the canonical single empty run for an empty paragraph', () => {
    const value = [
      { id: 'p1', type: 'p', children: [{ type: 'slash_input', children: [{ text: '' }] }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([{ id: 'p1', type: 'p', children: [{ text: '' }] }])
    }
  })

  it('strips dnd/slash/selection editor-state props from blocks and leaves', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        isDragging: true,
        dropLine: 'bottom',
        __slashOpen: true,
        selection: { anchor: { path: [0, 0], offset: 1 } },
        children: [{ text: 'stable', dragOver: '', selected: false }],
      },
      {
        id: 'li-1',
        type: 'p',
        listStyleType: 'decimal',
        listStart: 3,
        listRestartPolite: 3,
        children: [{ text: 'step' }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'p1', type: 'p', children: [{ text: 'stable' }] },
        // v1 flat item -> v2 container (listStart/listRestartPolite dropped).
        {
          id: 'li-1',
          type: 'ol',
          children: [{ type: 'li', children: [{ type: 'lic', children: [{ text: 'step' }] }] }],
        },
      ])
    }
  })

  it('carousel: whitelists slide props in order, drops empty strips silently', () => {
    const value = [
      {
        id: 'car',
        type: 'carousel',
        // Editor-internal block prop — stripped.
        selectedIndex: 1,
        images: [
          {
            asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
            url: 'https://cdn.example.com/1.webp',
            alt: 'One',
            width: 640,
            height: 480,
            caption: [{ text: 'FIG A' }],
            // Editor-internal slide prop — stripped.
            zoomLevel: 3,
          },
          {
            asset_id: '9e5b0d12-6a3c-4f8e-b7d1-5c4a8e2f9b02',
            url: 'https://cdn.example.com/2.webp',
            alt: 'Two',
            width: 800,
            height: 600,
            // Empty caption carries no content — the prop drops.
            caption: [],
          },
        ],
        children: [{ text: '' }],
      },
      // An emptied/abandoned strip drops at save, never blocking it.
      { id: 'empty', type: 'carousel', images: [], children: [{ text: '' }] },
      { id: 'after', type: 'p', children: [{ text: 'after' }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'car',
          type: 'carousel',
          images: [
            {
              asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
              url: 'https://cdn.example.com/1.webp',
              alt: 'One',
              width: 640,
              height: 480,
              caption: [{ text: 'FIG A' }],
            },
            {
              asset_id: '9e5b0d12-6a3c-4f8e-b7d1-5c4a8e2f9b02',
              url: 'https://cdn.example.com/2.webp',
              alt: 'Two',
              width: 800,
              height: 600,
            },
          ],
          children: [{ text: '' }],
        },
        { id: 'after', type: 'p', children: [{ text: 'after' }] },
      ])
    }
  })

  it('carousel: serializes as an id-less column child (and drops empty in-column)', () => {
    const slide = {
      asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
      url: 'https://cdn.example.com/1.webp',
      alt: 'One',
      width: 640,
      height: 480,
    }
    const value = [
      {
        id: 'cols',
        type: 'column_group',
        children: [
          {
            type: 'column',
            width: '50%',
            children: [
              // NodeIdPlugin may stamp nested ids — stripped below top level.
              { id: 'junk', type: 'carousel', images: [slide], children: [{ text: '' }] },
              { type: 'carousel', images: [], children: [{ text: '' }] },
            ],
          },
          {
            type: 'column',
            width: '50%',
            children: [{ type: 'p', children: [{ text: 'partner' }] }],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const group = result.content[0]
      expect(group).toMatchObject({
        id: 'cols',
        type: 'column_group',
      })
      if (group?.type === 'column_group') {
        // The empty strip dropped; the survivor is id-less.
        expect(group.children[0]?.children).toEqual([
          { type: 'carousel', images: [slide], children: [{ text: '' }] },
        ])
      }
    }
  })

  it('round-trips a full document containing every artifact at once', () => {
    const value = [
      {
        id: 'h',
        type: 'h2',
        dropLine: 'top',
        children: [{ text: 'Heading' }],
      },
      {
        id: 'p1',
        type: 'p',
        isDragging: true,
        children: [
          { text: 'before ' },
          { type: 'slash_input', children: [{ text: 'call' }] },
          { text: ' after' },
        ],
      },
      {
        id: 'co',
        type: 'callout',
        variant: 'warning',
        children: [
          {
            type: 'p',
            children: [{ text: 'body ' }, { type: 'slash_input', children: [{ text: '' }] }],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'h', type: 'h2', children: [{ text: 'Heading' }] },
        {
          id: 'p1',
          type: 'p',
          children: [{ text: 'before ' }, { text: 'call' }, { text: ' after' }],
        },
        {
          id: 'co',
          type: 'callout',
          variant: 'warning',
          children: [{ type: 'p', children: [{ text: 'body ' }] }],
        },
      ])
    }
  })
})

describe('toEditorValue (mount-time deserialization, DUAL-READ)', () => {
  it('upgrades v1 flat lists to containers, tagging lis with their v1 ids', () => {
    const value = toEditorValue(LEGACY_FLAT_LIST_DOCUMENT)
    expect(value.map((block) => block.type)).toEqual(['h2', 'ul', 'ol', 'p'])
    const ul = value[1] as ListBlock
    expect(ul.id).toBe('lg-li-absorption')
    expect(ul.children.map((item) => item.id)).toEqual(['lg-li-absorption', 'lg-li-distribution'])
    // The indent-2 item nests inside the second li, keeping its v1 id.
    const nested = ul.children[1]?.children[1]
    expect(nested?.type).toBe('ul')
    expect(nested?.children[0]?.id).toBe('lg-li-distribution-detail')
    // Source content is never mutated.
    expect(LEGACY_FLAT_LIST_DOCUMENT[1]?.type).toBe('p')
  })

  it('passes v2 container lists through unchanged', () => {
    expect(toEditorValue(FIXTURE_DOCUMENT)).toEqual(FIXTURE_DOCUMENT)
  })

  it('round-trips the v2 fixture back through fromEditorValue identically', () => {
    const result = fromEditorValue(toEditorValue(FIXTURE_DOCUMENT))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toEqual(FIXTURE_DOCUMENT)
  })

  it('LEGACY UPGRADE round-trip: flat in -> container out (li ids stripped)', () => {
    const result = fromEditorValue(toEditorValue(LEGACY_FLAT_LIST_DOCUMENT))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'lg-h2', type: 'h2', children: [{ text: 'Pharmacokinetics' }] },
        {
          id: 'lg-li-absorption',
          type: 'ul',
          children: [
            {
              type: 'li',
              children: [{ type: 'lic', children: [{ text: 'Rapid gastric absorption' }] }],
            },
            {
              type: 'li',
              children: [
                {
                  type: 'lic',
                  children: [
                    { text: 'Wide distribution, ' },
                    { text: 'protein-bound', bold: true },
                  ],
                },
                {
                  type: 'ul',
                  children: [
                    {
                      type: 'li',
                      children: [{ type: 'lic', children: [{ text: 'Albumin binding ~90%' }] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: 'lg-ol-step-1',
          type: 'ol',
          children: [
            {
              type: 'li',
              children: [{ type: 'lic', children: [{ text: 'Hydrolysis to salicylate' }] }],
            },
            {
              type: 'li',
              children: [{ type: 'lic', children: [{ text: 'Hepatic conjugation' }] }],
            },
          ],
        },
        { id: 'lg-p-outro', type: 'p', children: [{ text: 'Plain closing paragraph.' }] },
      ])
    }
  })
})

describe('fromEditorValue — schema v2 blocks', () => {
  it('strips nested ids and editor junk from container lists', () => {
    const value = [
      {
        id: 'list',
        type: 'ul',
        __dragging: true,
        children: [
          {
            id: 'li-junk',
            type: 'li',
            selected: true,
            children: [
              { id: 'lic-junk', type: 'lic', children: [{ text: 'item' }] },
              {
                id: 'nested-junk',
                type: 'ol',
                children: [
                  { type: 'li', children: [{ type: 'lic', children: [{ text: 'sub' }] }] },
                ],
              },
            ],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'list',
          type: 'ul',
          children: [
            {
              type: 'li',
              children: [
                { type: 'lic', children: [{ text: 'item' }] },
                {
                  type: 'ol',
                  children: [
                    { type: 'li', children: [{ type: 'lic', children: [{ text: 'sub' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ])
    }
  })

  it('keeps toggle summaries + top-level indent; strips toggle editor state', () => {
    const value = [
      { id: 't', type: 'toggle', __open: true, children: [{ text: 'More' }] },
      { id: 'body', type: 'p', indent: 1, children: [{ text: 'Inside' }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 't', type: 'toggle', children: [{ text: 'More' }] },
        { id: 'body', type: 'p', indent: 1, children: [{ text: 'Inside' }] },
      ])
    }
  })

  it('keeps hr as a void block', () => {
    const result = fromEditorValue([
      { id: 'rule', type: 'hr', children: [{ text: 'junk', bold: true }] },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([{ id: 'rule', type: 'hr', children: [{ text: '' }] }])
    }
  })

  it('whitelists align/lineHeight and drops unknown styling values', () => {
    const value = [
      { id: 'a', type: 'p', align: 'center', lineHeight: 2, children: [{ text: 'ok' }] },
      { id: 'b', type: 'h2', align: 'weird', lineHeight: 99, children: [{ text: 'clamped' }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]).toEqual({
        id: 'a',
        type: 'p',
        align: 'center',
        lineHeight: 2,
        children: [{ text: 'ok' }],
      })
      expect(result.content[1]).toEqual({ id: 'b', type: 'h2', children: [{ text: 'clamped' }] })
    }
  })

  it('whitelists color/backgroundColor/fontSize marks and drops malformed CSS', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [
          {
            text: 'ok',
            color: '#b91c1c',
            backgroundColor: 'rgb(254, 240, 138)',
            fontSize: '20px',
          },
          {
            text: 'bad',
            color: 'url(evil)',
            backgroundColor: 'expression(x)',
            fontSize: 'calc(1px)',
          },
          { text: 'hl', highlight: true, kbd: true },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]?.children).toEqual([
        { text: 'ok', color: '#b91c1c', backgroundColor: 'rgb(254, 240, 138)', fontSize: '20px' },
        { text: 'bad' },
        { text: 'hl', highlight: true, kbd: true },
      ])
    }
  })

  it('keeps valid inline dates and drops unset ones', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [
          { text: 'Reviewed ' },
          { type: 'date', date: '2026-07-24', extra: true, children: [{ text: '' }] },
          { type: 'date', date: 'not-a-date', children: [{ text: '' }] },
          { text: '.' },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]?.children).toEqual([
        { text: 'Reviewed ' },
        { type: 'date', date: '2026-07-24', children: [{ text: '' }] },
        { text: '.' },
      ])
    }
  })

  it('column groups: strips nested ids, keeps widths, drops editor sizing junk', () => {
    const value = [
      {
        id: 'cols',
        type: 'column_group',
        layout: [50, 50],
        children: [
          {
            id: 'col-junk',
            type: 'column',
            width: '50%',
            children: [{ id: 'p-junk', type: 'p', children: [{ text: 'left' }] }],
          },
          {
            type: 'column',
            width: 'bogus',
            children: [{ type: 'p', children: [{ text: 'right' }] }],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'cols',
          type: 'column_group',
          children: [
            {
              type: 'column',
              width: '50%',
              children: [{ type: 'p', children: [{ text: 'left' }] }],
            },
            { type: 'column', children: [{ type: 'p', children: [{ text: 'right' }] }] },
          ],
        },
      ])
    }
  })

  it('columns admit img/video children with the exact top-level prop whitelist', () => {
    const value = [
      {
        id: 'cols',
        type: 'column_group',
        children: [
          {
            id: 'col-junk',
            type: 'column',
            width: '50%',
            children: [
              {
                id: 'img-junk',
                type: 'img',
                url: 'https://cdn.example.com/x.webp',
                alt: 'Diagram',
                asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
                width: 640,
                height: 480,
                caption: [{ text: 'FIG — diagram' }],
                indent: 2, // top-level-only prop — must strip inside a column
                zoomable: true, // unknown prop — must strip
                children: [{ text: '' }],
              },
            ],
          },
          {
            type: 'column',
            width: '50%',
            children: [
              {
                id: 'vid-junk',
                type: 'video',
                url: 'https://youtu.be/dQw4w9WgXcQ',
                caption: [{ text: 'VIDEO — walkthrough' }],
                playing: true, // unknown prop — must strip
                children: [{ text: '' }],
              },
            ],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'cols',
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
              ],
            },
          ],
        },
      ])
    }
  })

  it('columns admit headings/equations/toc, ids stripped (2026-07-26 amendment)', () => {
    const result = fromEditorValue([
      {
        id: 'cols',
        type: 'column_group',
        children: [
          {
            type: 'column',
            children: [
              { id: 'h-junk', type: 'h2', align: 'center', children: [{ text: 'Col heading' }] },
              {
                id: 'eq-junk',
                type: 'equation',
                texExpression: 'E = mc^2',
                children: [{ text: '' }],
              },
            ],
          },
          {
            type: 'column',
            children: [{ id: 'toc-junk', type: 'toc', children: [{ text: '' }] }],
          },
        ],
      },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'cols',
          type: 'column_group',
          children: [
            {
              type: 'column',
              children: [
                { type: 'h2', align: 'center', children: [{ text: 'Col heading' }] },
                { type: 'equation', texExpression: 'E = mc^2', children: [{ text: '' }] },
              ],
            },
            { type: 'column', children: [{ type: 'toc', children: [{ text: '' }] }] },
          ],
        },
      ])
    }
  })

  it('stored media-in-columns round-trips toEditorValue → fromEditorValue unchanged', () => {
    const stored = [
      {
        id: 'cols',
        type: 'column_group' as const,
        children: [
          {
            type: 'column' as const,
            width: '50%',
            children: [
              {
                type: 'img' as const,
                url: 'https://cdn.example.com/x.webp',
                alt: 'Diagram',
                asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
                width: 640,
                height: 480,
                caption: [{ text: 'FIG — diagram' }],
                children: [{ text: '' }] as [{ text: '' }],
              },
            ],
          },
          {
            type: 'column' as const,
            width: '50%',
            children: [
              {
                type: 'video' as const,
                url: 'https://youtu.be/dQw4w9WgXcQ',
                caption: [{ text: 'VIDEO — walkthrough' }],
                children: [{ text: '' }] as [{ text: '' }],
              },
            ],
          },
        ],
      },
    ]
    const result = fromEditorValue(toEditorValue(stored))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual(stored)
    }
  })

  it('rejects toggle and nested column groups inside columns instead of dropping them', () => {
    const groupWith = (child: Record<string, unknown>) => [
      {
        id: 'cols',
        type: 'column_group',
        children: [
          { type: 'column', children: [child] },
          { type: 'column', children: [{ type: 'p', children: [{ text: 'fine' }] }] },
        ],
      },
    ]
    const toggled = fromEditorValue(groupWith({ type: 'toggle', children: [{ text: 'nope' }] }))
    expect(toggled.ok).toBe(false)
    if (!toggled.ok) {
      expect(toggled.errors.join(' ')).toContain('not allowed inside a column')
    }
    const nested = fromEditorValue(
      groupWith({
        type: 'column_group',
        children: [
          { type: 'column', children: [{ type: 'p', children: [{ text: 'a' }] }] },
          { type: 'column', children: [{ type: 'p', children: [{ text: 'b' }] }] },
        ],
      }),
    )
    expect(nested.ok).toBe(false)
    if (!nested.ok) {
      expect(nested.errors.join(' ')).toContain('not allowed inside a column')
    }
  })

  it('drops an open emoji_input element like any editor-time inline wrapper', () => {
    const value = [
      {
        id: 'p1',
        type: 'p',
        children: [{ text: 'mood ' }, { type: 'emoji_input', children: [{ text: 'smile' }] }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'p1', type: 'p', children: [{ text: 'mood ' }, { text: 'smile' }] },
      ])
    }
  })

  it('equations: whitelists texExpression, coerces void children, strips junk', () => {
    const value = [
      {
        id: 'eq',
        type: 'equation',
        texExpression: '\\frac{dC}{dt} = -kC',
        __katexOpen: true,
        children: [{ text: 'stray', bold: true }],
      },
      {
        id: 'p1',
        type: 'p',
        children: [
          { text: 'rate ' },
          {
            type: 'inline_equation',
            texExpression: 'k_e',
            selected: true,
            children: [{ text: 'junk' }],
          },
        ],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        {
          id: 'eq',
          type: 'equation',
          texExpression: '\\frac{dC}{dt} = -kC',
          children: [{ text: '' }],
        },
        {
          id: 'p1',
          type: 'p',
          children: [
            { text: 'rate ' },
            { type: 'inline_equation', texExpression: 'k_e', children: [{ text: '' }] },
          ],
        },
      ])
    }
  })

  it('equations: an empty inline chip drops; an empty block stays a placeholder', () => {
    const result = fromEditorValue([
      {
        id: 'p1',
        type: 'p',
        children: [
          { text: 'before ' },
          { type: 'inline_equation', texExpression: '', children: [{ text: '' }] },
          { text: ' after' },
        ],
      },
      { id: 'eq', type: 'equation', texExpression: '', children: [{ text: '' }] },
      // A non-string texExpression (editor glitch) coerces to the empty
      // placeholder rather than failing the save.
      { id: 'eq2', type: 'equation', texExpression: 42, children: [{ text: '' }] },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content).toEqual([
        { id: 'p1', type: 'p', children: [{ text: 'before ' }, { text: ' after' }] },
        { id: 'eq', type: 'equation', texExpression: '', children: [{ text: '' }] },
        { id: 'eq2', type: 'equation', texExpression: '', children: [{ text: '' }] },
      ])
    }
  })

  it('equations: inline chips survive inside table cells and list items', () => {
    const chip = { type: 'inline_equation', texExpression: 'V_d', children: [{ text: '' }] }
    const result = fromEditorValue([
      {
        id: 'tbl',
        type: 'table',
        children: [
          {
            type: 'tr',
            children: [
              { type: 'td', children: [{ type: 'p', children: [{ text: 'vol ' }, chip] }] },
            ],
          },
        ],
      },
      {
        id: 'list',
        type: 'ul',
        children: [{ type: 'li', children: [{ type: 'lic', children: [chip] }] }],
      },
    ])
    expect(result.ok).toBe(true)
    if (result.ok) {
      const table = result.content[0] as TableBlock
      expect(table.children[0]?.children[0]?.children[0]?.children).toEqual([
        { text: 'vol ' },
        chip,
      ])
      const list = result.content[1] as ListBlock
      expect(list.children[0]?.children[0]?.children).toEqual([chip])
    }
  })

  it('merged-cell round-trip: fixture table keeps its spans', () => {
    const result = fromEditorValue(FIXTURE_DOCUMENT)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const table = result.content.find((block) => block.id === 'fx-table-doses') as TableBlock
      const merged = table.children[2]?.children[0] as TableCell
      expect(merged.colSpan).toBe(2)
    }
  })
})
