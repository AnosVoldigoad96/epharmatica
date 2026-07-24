import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT } from '../fixtures'
import type { Content, ParagraphBlock } from '../schema/types'
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

  it('strips editor-only table and list props (colSpan/rowSpan/colSizes/listStart)', () => {
    const value = [
      {
        id: 'tbl',
        type: 'table',
        colSizes: [120, 120],
        children: [
          {
            type: 'tr',
            children: [
              {
                type: 'th',
                colSpan: 2,
                rowSpan: 1,
                children: [{ type: 'p', children: [{ text: 'h' }] }],
              },
            ],
          },
        ],
      },
      {
        id: 'li-1',
        type: 'p',
        listStyleType: 'decimal',
        listStart: 2,
        indent: 1,
        children: [{ text: 'step' }],
      },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]).toEqual({
        id: 'tbl',
        type: 'table',
        children: [
          {
            type: 'tr',
            children: [{ type: 'th', children: [{ type: 'p', children: [{ text: 'h' }] }] }],
          },
        ],
      })
      // indent 1 is the canonical omitted level; listStart never persists.
      expect(result.content[1]).toEqual({
        id: 'li-1',
        type: 'p',
        listStyleType: 'decimal',
        children: [{ text: 'step' }],
      })
    }
  })

  it('keeps indent >= 2 on list items, drops indent without listStyleType', () => {
    const value = [
      { id: 'a', type: 'p', listStyleType: 'disc', indent: 2, children: [{ text: 'deep' }] },
      { id: 'b', type: 'p', indent: 3, children: [{ text: 'plain' }] },
    ]
    const result = fromEditorValue(value)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.content[0] as ParagraphBlock).indent).toBe(2)
      expect(result.content[1]).toEqual({ id: 'b', type: 'p', children: [{ text: 'plain' }] })
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
        { id: 'li-1', type: 'p', listStyleType: 'decimal', children: [{ text: 'step' }] },
      ])
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

describe('toEditorValue (mount-time deserialization)', () => {
  it('seeds indent: 1 on flat list items so the list plugin keeps them', () => {
    const content: Content = [
      { id: 'li', type: 'p', listStyleType: 'disc', children: [{ text: 'item' }] },
      { id: 'li2', type: 'p', listStyleType: 'disc', indent: 2, children: [{ text: 'deep' }] },
      { id: 'p', type: 'p', children: [{ text: 'plain' }] },
    ]
    const value = toEditorValue(content) as ParagraphBlock[]
    expect(value[0]?.indent).toBe(1)
    expect(value[1]?.indent).toBe(2)
    expect(value[2]?.indent).toBeUndefined()
    // Source content is never mutated.
    expect((content[0] as ParagraphBlock).indent).toBeUndefined()
  })

  it('round-trips back through fromEditorValue to the identical document', () => {
    const result = fromEditorValue(toEditorValue(FIXTURE_DOCUMENT))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toEqual(FIXTURE_DOCUMENT)
  })
})
