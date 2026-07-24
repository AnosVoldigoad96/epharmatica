import { describe, expect, it } from 'vitest'
import { splitSnippet } from './snippet'

describe('splitSnippet', () => {
  it('returns plain text untouched', () => {
    expect(splitSnippet('warfarin inhibits vitamin K')).toEqual([
      { text: 'warfarin inhibits vitamin K', hit: false },
    ])
  })

  it('marks a single sentinel-wrapped hit', () => {
    expect(splitSnippet('the [[[warfarin]]] monograph')).toEqual([
      { text: 'the ', hit: false },
      { text: 'warfarin', hit: true },
      { text: ' monograph', hit: false },
    ])
  })

  it('handles multiple hits in order', () => {
    expect(splitSnippet('[[[beta]]] blockers reduce [[[heart]]] rate')).toEqual([
      { text: 'beta', hit: true },
      { text: ' blockers reduce ', hit: false },
      { text: 'heart', hit: true },
      { text: ' rate', hit: false },
    ])
  })

  it('handles hits at the very start and end', () => {
    expect(splitSnippet('[[[aspirin]]] and [[[clopidogrel]]]')).toEqual([
      { text: 'aspirin', hit: true },
      { text: ' and ', hit: false },
      { text: 'clopidogrel', hit: true },
    ])
  })

  it('handles adjacent hits without empty parts', () => {
    expect(splitSnippet('[[[ace]]][[[inhibitor]]]')).toEqual([
      { text: 'ace', hit: true },
      { text: 'inhibitor', hit: true },
    ])
  })

  it('treats an unclosed start marker as plain text', () => {
    expect(splitSnippet('dose [[[unterminated tail')).toEqual([
      { text: 'dose ', hit: false },
      { text: 'unterminated tail', hit: false },
    ])
  })

  it('passes a stray end marker through as text', () => {
    expect(splitSnippet('stray ]]] marker')).toEqual([{ text: 'stray ]]] marker', hit: false }])
  })

  it('returns no parts for an empty snippet', () => {
    expect(splitSnippet('')).toEqual([])
  })

  it('drops an empty hit between adjacent markers', () => {
    expect(splitSnippet('a [[[]]] b')).toEqual([
      { text: 'a ', hit: false },
      { text: ' b', hit: false },
    ])
  })

  it('keeps the ts_headline fragment delimiter as plain text', () => {
    expect(splitSnippet('first [[[hit]]] … second [[[hit]]]')).toEqual([
      { text: 'first ', hit: false },
      { text: 'hit', hit: true },
      { text: ' … second ', hit: false },
      { text: 'hit', hit: true },
    ])
  })
})
