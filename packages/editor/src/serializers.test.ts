import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT } from './fixtures'
import type { Content } from './schema/types'
import {
  countWords,
  defaultPreviewBlockCount,
  deriveReadingMinutes,
  derivePrimaryVideoUrl,
  getHeadingsText,
  getImageAssetIds,
  getPlainText,
} from './serializers'

const paragraph = (id: string, text: string): Content[number] => ({
  id,
  type: 'p',
  children: [{ text }],
})

const heading = (id: string, text: string): Content[number] => ({
  id,
  type: 'h2',
  children: [{ text }],
})

describe('getPlainText', () => {
  const plain = getPlainText(FIXTURE_DOCUMENT)

  it('includes prose with marks and link text flattened', () => {
    expect(plain).toContain('Aspirin irreversibly inhibits cyclooxygenase via acetylation')
    expect(plain).toContain('the COX pathway')
  })

  it('includes table cell text (M1 §5.9)', () => {
    expect(plain).toContain('75–100 mg daily')
  })

  it('includes Drug Card field values but not field labels', () => {
    expect(plain).toContain('GI bleeding, tinnitus, bronchospasm')
    expect(plain).not.toContain('Adverse effects')
  })

  it('includes captions and image alt text', () => {
    expect(plain).toContain('FIG 1 — Acetylsalicylic acid')
    expect(plain).toContain('VIDEO — COX inhibition, step by step')
    expect(plain).toContain('Skeletal structure of acetylsalicylic acid')
  })

  it('includes code lines and callout bodies', () => {
    expect(plain).toContain('loading_dose = Vd × Cp_target')
    expect(plain).toContain('Enteric coating delays but does not reduce absorption.')
  })

  it('excludes callout eyebrow labels (chrome, not content)', () => {
    expect(plain).not.toContain('Clinical Pearl')
  })

  it('includes container list items, nested ones too (schema v2)', () => {
    expect(plain).toContain('Rapid gastric absorption')
    expect(plain).toContain('Albumin binding ~90%')
    expect(plain).toContain('Hepatic conjugation')
  })

  it('includes toggle summaries AND their (top-level) contents', () => {
    expect(plain).toContain('Advanced: salicylate kinetics')
    expect(plain).toContain('Zero-order elimination emerges at toxic concentrations.')
    expect(plain).toContain('Half-life extends 20h+')
  })

  it('includes text inside columns — every nested block', () => {
    expect(plain).toContain('COX-1: constitutive, gastric protection.')
    expect(plain).toContain('COX-2: inducible, inflammation.')
    expect(plain).toContain('Selective NSAIDs')
  })

  it('includes column-hosted media alt/captions and heading text (2026-07-26 amendment)', () => {
    const doc: Content = [
      {
        id: 'cols',
        type: 'column_group',
        children: [
          {
            type: 'column',
            children: [
              { type: 'h2', children: [{ text: 'Column heading' }] },
              {
                type: 'img',
                url: 'https://cdn.example.com/x.webp',
                alt: 'Skeletal diagram',
                asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
                width: 640,
                height: 480,
                caption: [{ text: 'FIG — in-column diagram' }],
                children: [{ text: '' }],
              },
            ],
          },
          {
            type: 'column',
            children: [
              {
                type: 'video',
                url: 'https://youtu.be/dQw4w9WgXcQ',
                caption: [{ text: 'VIDEO — in-column walkthrough' }],
                children: [{ text: '' }],
              },
              { type: 'equation', texExpression: 'E = mc^2', children: [{ text: '' }] },
            ],
          },
        ],
      },
    ]
    const text = getPlainText(doc)
    expect(text).toContain('Column heading')
    expect(text).toContain('Skeletal diagram')
    expect(text).toContain('FIG — in-column diagram')
    expect(text).toContain('VIDEO — in-column walkthrough')
    expect(text).toContain('E = mc^2')
    // Column-hosted headings stay OUT of the outline weight (no id, no TOC).
    expect(getHeadingsText(doc)).toBe('')
  })

  it('includes every carousel slide alt AND caption (the strip is searchable)', () => {
    expect(plain).toContain('Arachidonic acid release from membrane phospholipids')
    expect(plain).toContain('STEP 1 — Phospholipase A2')
    expect(plain).toContain('STEP 2 — COX catalysis')
    // A caption-less slide still contributes its alt.
    expect(plain).toContain('Tissue-specific synthases yield active prostanoids')
  })

  it('includes inline dates as their deterministic display text', () => {
    expect(plain).toContain('Jul 24, 2026')
  })

  it('includes merged table cell text', () => {
    expect(plain).toContain('Analgesic: 300–900 mg q4–6h')
  })

  it('includes the raw TeX of block and inline equations (searchable)', () => {
    expect(plain).toContain('pH = pK_a + \\log_{10}\\frac{[A^-]}{[HA]}')
    expect(plain).toContain('Clearance follows CL = k_e \\cdot V_d at steady state.')
  })
})

describe('getHeadingsText', () => {
  it('collects h2 and h3 text only', () => {
    expect(getHeadingsText(FIXTURE_DOCUMENT)).toBe('Pharmacokinetics\nMonitoring')
  })
})

describe('getImageAssetIds (the media usage scan, M4 §6)', () => {
  const img = (id: string, asset: string): Content[number] => ({
    id,
    type: 'img',
    url: 'https://cdn.example.com/x.webp',
    alt: 'x',
    asset_id: asset,
    width: 10,
    height: 10,
    children: [{ text: '' }],
  })

  it('collects img blocks and every carousel slide, deduped, in document order', () => {
    const doc: Content = [
      img('i1', 'aaaaaaaa-0000-4000-8000-000000000001'),
      {
        id: 'car',
        type: 'carousel',
        images: [
          {
            asset_id: 'aaaaaaaa-0000-4000-8000-000000000002',
            url: 'https://cdn.example.com/1.webp',
            alt: 'One',
            width: 10,
            height: 10,
          },
          {
            // Duplicate of the img block's asset — deduped.
            asset_id: 'aaaaaaaa-0000-4000-8000-000000000001',
            url: 'https://cdn.example.com/x.webp',
            alt: 'Again',
            width: 10,
            height: 10,
          },
        ],
        children: [{ text: '' }],
      },
    ]
    expect(getImageAssetIds(doc)).toEqual([
      'aaaaaaaa-0000-4000-8000-000000000001',
      'aaaaaaaa-0000-4000-8000-000000000002',
    ])
  })

  it('reaches img and carousel blocks INSIDE columns (id-less children)', () => {
    const doc: Content = [
      {
        id: 'cols',
        type: 'column_group',
        children: [
          {
            type: 'column',
            children: [
              {
                type: 'img',
                url: 'https://cdn.example.com/x.webp',
                alt: 'x',
                asset_id: 'aaaaaaaa-0000-4000-8000-000000000003',
                width: 10,
                height: 10,
                children: [{ text: '' }],
              },
            ],
          },
          {
            type: 'column',
            children: [
              {
                type: 'carousel',
                images: [
                  {
                    asset_id: 'aaaaaaaa-0000-4000-8000-000000000004',
                    url: 'https://cdn.example.com/y.webp',
                    alt: 'y',
                    width: 10,
                    height: 10,
                  },
                ],
                children: [{ text: '' }],
              },
            ],
          },
        ],
      },
    ]
    expect(getImageAssetIds(doc)).toEqual([
      'aaaaaaaa-0000-4000-8000-000000000003',
      'aaaaaaaa-0000-4000-8000-000000000004',
    ])
  })

  it('finds the fixture img + all three carousel slides (publish refs)', () => {
    expect(getImageAssetIds(FIXTURE_DOCUMENT)).toEqual([
      '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
      '7c1f3f7e-9d24-4c1a-8b60-2f9b2f6f1a01',
      '9e5b0d12-6a3c-4f8e-b7d1-5c4a8e2f9b02',
      '2a7d9c44-1b5e-4d2f-9e83-7f6b3d1c8e03',
    ])
  })

  it('returns nothing for media-less documents', () => {
    expect(getImageAssetIds([paragraph('p1', 'text only')])).toEqual([])
  })
})

describe('countWords / deriveReadingMinutes', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('  one two\nthree  ')).toBe(3)
    expect(countWords('')).toBe(0)
  })

  it('floors reading time at 1 minute', () => {
    expect(deriveReadingMinutes([paragraph('p1', 'Short.')])).toBe(1)
    expect(deriveReadingMinutes([])).toBe(1)
  })

  it('applies ceil(words/200) above the floor', () => {
    const words = Array.from({ length: 401 }, (_, index) => `word${index}`).join(' ')
    expect(deriveReadingMinutes([paragraph('p1', words)])).toBe(3)
  })
})

describe('derivePrimaryVideoUrl', () => {
  it('returns the FIRST video block URL (M1-2)', () => {
    expect(derivePrimaryVideoUrl(FIXTURE_DOCUMENT)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('returns null when the document has no video', () => {
    expect(derivePrimaryVideoUrl([paragraph('p1', 'no video here')])).toBeNull()
  })

  it('finds a video living inside a column group (document order)', () => {
    const columnVideo: Content = [
      paragraph('p1', 'intro'),
      {
        id: 'cols',
        type: 'column_group',
        children: [
          { type: 'column', children: [{ type: 'p', children: [{ text: 'left' }] }] },
          {
            type: 'column',
            children: [
              {
                type: 'video',
                url: 'https://youtu.be/aaaaaaaaaaa',
                caption: [{ text: 'VIDEO — in-column' }],
                children: [{ text: '' }],
              },
            ],
          },
        ],
      },
      {
        id: 'v-late',
        type: 'video',
        url: 'https://youtu.be/bbbbbbbbbbb',
        caption: [{ text: 'VIDEO — later, top level' }],
        children: [{ text: '' }],
      },
    ]
    expect(derivePrimaryVideoUrl(columnVideo)).toBe('https://youtu.be/aaaaaaaaaaa')
  })
})

describe('defaultPreviewBlockCount (M1 §5.4)', () => {
  it('cuts exclusive of the first heading after index 0', () => {
    const content: Content = [
      paragraph('p1', 'a'),
      paragraph('p2', 'b'),
      heading('h1x', 'Section'),
      paragraph('p3', 'c'),
    ]
    expect(defaultPreviewBlockCount(content)).toBe(2)
  })

  it('ignores a heading at index 0', () => {
    const content: Content = [
      heading('h0', 'Lead'),
      paragraph('p1', 'a'),
      heading('h1x', 'Next'),
      paragraph('p2', 'b'),
    ]
    expect(defaultPreviewBlockCount(content)).toBe(2)
  })

  it('caps at 5 blocks', () => {
    const long: Content = Array.from({ length: 9 }, (_, index) =>
      paragraph(`p${index}`, `text ${index}`),
    )
    expect(defaultPreviewBlockCount(long)).toBe(5)
    const headingLate: Content = [...long.slice(0, 7), heading('h7', 'Late'), paragraph('p8', 'x')]
    expect(defaultPreviewBlockCount(headingLate)).toBe(5)
  })

  it('never returns below 1', () => {
    expect(defaultPreviewBlockCount([paragraph('p1', 'only block')])).toBe(1)
    expect(defaultPreviewBlockCount([])).toBe(1)
  })
})
