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
    const result = validateContent([
      { id: 'b1', type: 'p', children: [{ text: 'x', highlight: true }] },
    ])
    expect(result.ok).toBe(false)
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
