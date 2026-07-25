import { describe, expect, it } from 'vitest'

import { FIXTURE_DOCUMENT } from './fixtures'
import type { Content } from './schema/types'
import {
  countWords,
  defaultPreviewBlockCount,
  deriveReadingMinutes,
  derivePrimaryVideoUrl,
  getHeadingsText,
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

  it('includes inline dates as their deterministic display text', () => {
    expect(plain).toContain('Jul 24, 2026')
  })

  it('includes merged table cell text', () => {
    expect(plain).toContain('Analgesic: 300–900 mg q4–6h')
  })
})

describe('getHeadingsText', () => {
  it('collects h2 and h3 text only', () => {
    expect(getHeadingsText(FIXTURE_DOCUMENT)).toBe('Pharmacokinetics\nMonitoring')
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
