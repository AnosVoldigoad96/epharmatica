import { describe, expect, it } from 'vitest'

import { getAnchorKind, getTextRuns } from './anchors'
import { FIXTURE_DOCUMENT } from './fixtures'
import type { Block } from './schema/types'

function fixtureBlock(id: string): Block {
  const block = FIXTURE_DOCUMENT.find((candidate) => candidate.id === id)
  if (!block) throw new Error(`fixture block missing: ${id}`)
  return block
}

describe('getAnchorKind (M1 §5.5)', () => {
  it('maps every block type to its anchor kind', () => {
    expect(getAnchorKind(fixtureBlock('fx-p-intro'))).toBe('prose')
    expect(getAnchorKind(fixtureBlock('fx-h2-pharmacokinetics'))).toBe('prose')
    expect(getAnchorKind(fixtureBlock('fx-blockquote'))).toBe('prose')
    expect(getAnchorKind(fixtureBlock('fx-callout-warning'))).toBe('prose')
    expect(getAnchorKind(fixtureBlock('fx-table-doses'))).toBe('table')
    expect(getAnchorKind(fixtureBlock('fx-drugcard-aspirin'))).toBe('drugcard')
    expect(getAnchorKind(fixtureBlock('fx-code-calc'))).toBe('code')
    expect(getAnchorKind(fixtureBlock('fx-img-structure'))).toBe('caption')
    expect(getAnchorKind(fixtureBlock('fx-video-mechanism'))).toBe('caption')
    expect(getAnchorKind(fixtureBlock('fx-ul-absorption'))).toBe('list')
    expect(getAnchorKind(fixtureBlock('fx-ol-steps'))).toBe('list')
    expect(getAnchorKind(fixtureBlock('fx-toggle-details'))).toBe('prose')
    expect(getAnchorKind(fixtureBlock('fx-toc'))).toBeNull()
    expect(getAnchorKind(fixtureBlock('fx-hr'))).toBeNull()
    expect(getAnchorKind(fixtureBlock('fx-columns'))).toBeNull()
  })
})

describe('getTextRuns', () => {
  it('prose: concatenates the block text at path []', () => {
    expect(getTextRuns(fixtureBlock('fx-h2-pharmacokinetics'), [])).toBe('Pharmacokinetics')
    expect(getTextRuns(fixtureBlock('fx-p-intro'), [])).toContain(
      'Aspirin irreversibly inhibits cyclooxygenase',
    )
  })

  it('prose: a toggle anchors on its summary line', () => {
    expect(getTextRuns(fixtureBlock('fx-toggle-details'), [])).toBe('Advanced: salicylate kinetics')
  })

  it('list: locates li lines by nesting chain (schema v2)', () => {
    const list = fixtureBlock('fx-ul-absorption')
    expect(getTextRuns(list, [0])).toBe('Rapid gastric absorption')
    expect(getTextRuns(list, [1])).toBe('Wide distribution, protein-bound')
    // Nested item: second li -> its nested list -> first li.
    expect(getTextRuns(list, [1, 0])).toBe('Albumin binding ~90%')
  })

  it('list: out-of-range, malformed, and empty paths return null', () => {
    const list = fixtureBlock('fx-ul-absorption')
    expect(getTextRuns(list, [])).toBeNull()
    expect(getTextRuns(list, [9])).toBeNull()
    expect(getTextRuns(list, [0, 0])).toBeNull()
    expect(getTextRuns(list, ['0'])).toBeNull()
  })

  it('callout: concatenates paragraphs with newline (one anchor block)', () => {
    expect(getTextRuns(fixtureBlock('fx-callout-pearl'), [])).toBe(
      'Enteric coating delays but does not reduce absorption.\nChewing non-coated aspirin speeds onset in ACS.',
    )
  })

  it('prose: rejects non-empty paths', () => {
    expect(getTextRuns(fixtureBlock('fx-p-intro'), [0])).toBeNull()
  })

  it('table: locates cells by [row, col] — merged cells included', () => {
    const table = fixtureBlock('fx-table-doses')
    expect(getTextRuns(table, [0, 1])).toBe('Dose')
    expect(getTextRuns(table, [2, 0])).toBe('Analgesic: 300–900 mg q4–6h')
  })

  it('table: out-of-range and malformed paths return null', () => {
    const table = fixtureBlock('fx-table-doses')
    expect(getTextRuns(table, [9, 0])).toBeNull()
    expect(getTextRuns(table, [0])).toBeNull()
    expect(getTextRuns(table, ['0', '1'])).toBeNull()
  })

  it('drugcard: locates fields by key (M1 example path)', () => {
    const card = fixtureBlock('fx-drugcard-aspirin')
    expect(getTextRuns(card, ['adverse_effects'])).toBe('GI bleeding, tinnitus, bronchospasm')
    expect(getTextRuns(card, ['generic_name'])).toBe('Aspirin (acetylsalicylic acid)')
  })

  it('drugcard: absent fields and unknown keys return null', () => {
    const card = fixtureBlock('fx-drugcard-aspirin')
    expect(getTextRuns(card, ['monitoring'])).toBeNull()
    expect(getTextRuns(card, ['street_names'])).toBeNull()
  })

  it('code: locates lines by index', () => {
    const code = fixtureBlock('fx-code-calc')
    expect(getTextRuns(code, [1])).toBe('maintenance = CL × Cp_ss × tau')
    expect(getTextRuns(code, [5])).toBeNull()
  })

  it('caption: locates figure and video captions', () => {
    expect(getTextRuns(fixtureBlock('fx-img-structure'), ['caption'])).toBe(
      'FIG 1 — Acetylsalicylic acid',
    )
    expect(getTextRuns(fixtureBlock('fx-video-mechanism'), ['caption'])).toBe(
      'VIDEO — COX inhibition, step by step',
    )
    expect(getTextRuns(fixtureBlock('fx-img-structure'), ['alt'])).toBeNull()
  })

  it('toc/hr/column_group: have no text runs', () => {
    expect(getTextRuns(fixtureBlock('fx-toc'), [])).toBeNull()
    expect(getTextRuns(fixtureBlock('fx-hr'), [])).toBeNull()
    expect(getTextRuns(fixtureBlock('fx-columns'), [])).toBeNull()
    expect(getTextRuns(fixtureBlock('fx-columns'), [0, 0])).toBeNull()
  })
})
