import { describe, expect, it } from 'vitest'
import { noteDocToText, textToNoteDoc } from './note-doc'

describe('textToNoteDoc (v1 note input → standard block array)', () => {
  it('emits one paragraph block per line with stable shape', () => {
    const doc = textToNoteDoc('First line\nSecond line')
    expect(doc).toHaveLength(2)
    for (const block of doc) {
      expect(block.type).toBe('p')
      expect(typeof block.id).toBe('string')
      expect(block.id.length).toBeGreaterThan(0)
    }
    expect(doc[0]?.children).toEqual([{ text: 'First line' }])
    expect(doc[1]?.children).toEqual([{ text: 'Second line' }])
  })

  it('normalizes CRLF and trims blank edge lines, keeping interior breaks', () => {
    const doc = textToNoteDoc('\r\nalpha\r\n\r\nbeta\r\n')
    expect(doc.map((block) => block.children[0]?.text)).toEqual(['alpha', '', 'beta'])
  })

  it('never emits an empty array', () => {
    expect(textToNoteDoc('')).toHaveLength(1)
  })
})

describe('noteDocToText (stored jsonb → display text)', () => {
  it('round-trips through textToNoteDoc', () => {
    const text = 'Key point\n\nAnd a second paragraph'
    expect(noteDocToText(textToNoteDoc(text))).toBe(text)
  })

  it('reads marked-up children and list blocks', () => {
    const doc = [
      { id: '1', type: 'p', children: [{ text: 'Bold ', bold: true }, { text: 'tail' }] },
      {
        id: '2',
        type: 'ul',
        children: [
          { children: [{ children: [{ text: 'item one' }] }] },
          { children: [{ children: [{ text: 'item two' }] }] },
        ],
      },
    ]
    expect(noteDocToText(doc)).toBe('Bold tail\nitem one\nitem two')
  })

  it('is defensive against malformed content', () => {
    expect(noteDocToText(null)).toBe('')
    expect(noteDocToText('nope')).toBe('')
    expect(noteDocToText([{ bogus: true }, 42])).toBe('')
  })
})
