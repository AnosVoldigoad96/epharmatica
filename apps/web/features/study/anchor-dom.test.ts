// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  anchorFromRange,
  collectRunMap,
  rangeForAnchor,
  resolveBlockRoot,
  runPositionForDomPoint,
} from './anchor-dom'
import type { BlockRoot } from './anchor-dom'

/**
 * DOM↔anchor mapping fixtures (1.D · M1 §5.5 · R-M1: per-kind coverage).
 * The markup mirrors @epharmatica/editor's <RichText/> emission exactly —
 * data-block-id roots, rt-* class hooks, chrome (callout labels, drug-card
 * <dt>s, code trailing newlines) in the same places — written compactly so
 * no formatting whitespace pollutes the text runs.
 */

const SCOPE_HTML = [
  '<p data-block-id="p1">Alpha <strong>beta</strong> gamma</p>',
  '<aside data-block-id="c1" class="rt-callout rt-callout--definition">',
  '<p class="rt-callout__label">DEFINITION</p>',
  '<p>First para</p>',
  '<p>Second para</p>',
  '</aside>',
  '<div data-block-id="t1" class="rt-table-wrap"><table class="rt-table"><tbody>',
  '<tr><th><p>Head A</p></th><th><p>Head B</p></th></tr>',
  '<tr><td><p>Cell one</p><p>more</p></td><td><p>Cell two</p></td></tr>',
  '</tbody></table></div>',
  '<section data-block-id="d1" class="rt-drugcard">',
  '<p class="rt-drugcard__title">Metformin</p>',
  '<dl><div class="rt-drugcard__row" data-field="mechanism"><dt>MECHANISM</dt><dd>AMPK activation</dd></div></dl>',
  '</section>',
  '<pre data-block-id="cd1" class="rt-code"><code>' +
    '<span class="rt-code__line" data-line="0">const x = 1\n</span>' +
    '<span class="rt-code__line" data-line="1">let y\n</span>' +
    '</code></pre>',
  '<figure data-block-id="f1" class="rt-figure"><img alt="" /><figcaption>FIG 1 · Caption text</figcaption></figure>',
  '<ul data-block-id="l1" class="rt-list">' +
    '<li data-block-id="i1">Item one<ul class="rt-list"><li data-block-id="i2">Nested item</li></ul></li>' +
    '<li data-block-id="i3">Item two</li>' +
    '</ul>',
  '<details data-block-id="tg1" class="rt-toggle"><summary>Toggle summary</summary>' +
    '<div class="rt-toggle__body"><p data-block-id="p2">Body para</p></div></details>',
  '<p data-block-id="pe1">Before <span class="rt-inline-equation">' +
    '<span role="math" aria-label="E=mc^2"><span aria-hidden="true">rendered·katex</span></span>' +
    '</span> after</p>',
  '<nav data-block-id="toc1" class="rt-toc"><ol><li><a href="#h-x">Heading</a></li></ol></nav>',
].join('')

let scope: HTMLElement

beforeEach(() => {
  document.body.innerHTML = `<div id="scope">${SCOPE_HTML}</div>`
  scope = document.getElementById('scope') as HTMLElement
})

function textNodeOf(selector: string, index = 0): Text {
  const el = scope.querySelector(selector)
  if (!el) throw new Error(`missing ${selector}`)
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  for (let i = 0; i < index; i += 1) node = walker.nextNode()
  if (!node) throw new Error(`missing text node ${index} in ${selector}`)
  return node as Text
}

function makeRange(startNode: Node, startOffset: number, endNode: Node, endOffset: number): Range {
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  return range
}

describe('resolveBlockRoot', () => {
  it('resolves prose, walks list-item ids up to the list block, flags unanchorable blocks', () => {
    const prose = resolveBlockRoot(textNodeOf('[data-block-id="p1"]'), scope)
    expect((prose as BlockRoot).blockId).toBe('p1')
    expect((prose as BlockRoot).kind).toBe('prose')

    // li carries the ITEM id — the block root must be the outer list.
    const list = resolveBlockRoot(textNodeOf('li[data-block-id="i2"]'), scope)
    expect((list as BlockRoot).blockId).toBe('l1')
    expect((list as BlockRoot).kind).toBe('list')

    expect(resolveBlockRoot(textNodeOf('.rt-toc a'), scope)).toBe('unanchorable')
    expect(resolveBlockRoot(document.body, scope)).toBeNull()
  })
})

describe('anchorFromRange — per kind (M1 §11.3 fixture coverage)', () => {
  it('prose: offsets over the concatenated inline text across mark boundaries', () => {
    // 'Alpha ' + <strong>'beta'</strong> + ' gamma' → run 'Alpha beta gamma'
    const result = anchorFromRange(
      makeRange(
        textNodeOf('[data-block-id="p1"]'),
        2,
        textNodeOf('[data-block-id="p1"] strong'),
        3,
      ),
      scope,
    )
    expect(result).toMatchObject({
      ok: true,
      anchor: { block_id: 'p1', kind: 'prose', path: [], start: 2, end: 9, snapshot: 'pha bet' },
    })
  })

  it('callout: prose run joins body paragraphs with \\n and excludes the label', () => {
    const first = textNodeOf('[data-block-id="c1"] p:nth-of-type(2)')
    const second = textNodeOf('[data-block-id="c1"] p:nth-of-type(3)')
    const result = anchorFromRange(makeRange(first, 0, second, 6), scope)
    expect(result).toMatchObject({
      ok: true,
      anchor: {
        block_id: 'c1',
        kind: 'prose',
        path: [],
        start: 0,
        end: 17,
        snapshot: 'First para\nSecond',
      },
    })
  })

  it('callout: a selection starting in the label chrome is unanchorable', () => {
    const label = textNodeOf('[data-block-id="c1"] .rt-callout__label')
    const body = textNodeOf('[data-block-id="c1"] p:nth-of-type(2)')
    expect(anchorFromRange(makeRange(label, 0, body, 4), scope)).toMatchObject({
      ok: false,
      reason: 'unanchorable',
    })
  })

  it('table: [row, col] paths with offsets inside the cell (multi-paragraph)', () => {
    const cellP1 = textNodeOf('[data-block-id="t1"] tr:nth-child(2) td:first-child p:first-child')
    const cellP2 = textNodeOf('[data-block-id="t1"] tr:nth-child(2) td:first-child p:nth-child(2)')
    const result = anchorFromRange(makeRange(cellP1, 5, cellP2, 4), scope)
    expect(result).toMatchObject({
      ok: true,
      anchor: {
        block_id: 't1',
        kind: 'table',
        path: [1, 0],
        start: 5,
        end: 13,
        snapshot: 'one\nmore',
      },
    })
  })

  it('table: header cells anchor too, and cross-cell selections are rejected', () => {
    const head = textNodeOf('[data-block-id="t1"] th p')
    expect(anchorFromRange(makeRange(head, 0, head, 4), scope)).toMatchObject({
      ok: true,
      anchor: { kind: 'table', path: [0, 0], snapshot: 'Head' },
    })
    const cellA = textNodeOf('[data-block-id="t1"] tr:nth-child(2) td:first-child p')
    const cellB = textNodeOf('[data-block-id="t1"] tr:nth-child(2) td:nth-child(2) p')
    expect(anchorFromRange(makeRange(cellA, 0, cellB, 3), scope)).toMatchObject({
      ok: false,
      reason: 'multi-block',
    })
  })

  it('drugcard: field rows via <dd>, generic_name via the title; <dt> is chrome', () => {
    const dd = textNodeOf('[data-block-id="d1"] dd')
    expect(anchorFromRange(makeRange(dd, 0, dd, 4), scope)).toMatchObject({
      ok: true,
      anchor: { block_id: 'd1', kind: 'drugcard', path: ['mechanism'], snapshot: 'AMPK' },
    })
    const title = textNodeOf('[data-block-id="d1"] .rt-drugcard__title')
    expect(anchorFromRange(makeRange(title, 0, title, 9), scope)).toMatchObject({
      ok: true,
      anchor: { path: ['generic_name'], snapshot: 'Metformin' },
    })
    const dt = textNodeOf('[data-block-id="d1"] dt')
    expect(anchorFromRange(makeRange(dt, 0, dt, 4), scope)).toMatchObject({
      ok: false,
      reason: 'unanchorable',
    })
  })

  it('code: [line] paths; the literal trailing newline is not addressable', () => {
    const line0 = textNodeOf('[data-block-id="cd1"] .rt-code__line[data-line="0"]')
    const result = anchorFromRange(makeRange(line0, 0, line0, 12), scope)
    // Offset 12 covers the trailing '\n' — clamped to the 11-char run.
    expect(result).toMatchObject({
      ok: true,
      anchor: {
        block_id: 'cd1',
        kind: 'code',
        path: [0],
        start: 0,
        end: 11,
        snapshot: 'const x = 1',
      },
    })
    const line1 = textNodeOf('[data-block-id="cd1"] .rt-code__line[data-line="1"]')
    expect(anchorFromRange(makeRange(line0, 0, line1, 3), scope)).toMatchObject({
      ok: false,
      reason: 'multi-block',
    })
  })

  it('caption: the figcaption anchors under path ["caption"]', () => {
    const caption = textNodeOf('[data-block-id="f1"] figcaption')
    expect(anchorFromRange(makeRange(caption, 8, caption, 15), scope)).toMatchObject({
      ok: true,
      anchor: { block_id: 'f1', kind: 'caption', path: ['caption'], snapshot: 'Caption' },
    })
  })

  it('list: li index chains; nested items path deeper; runs exclude nested lists', () => {
    const outer = textNodeOf('li[data-block-id="i1"]')
    expect(anchorFromRange(makeRange(outer, 0, outer, 8), scope)).toMatchObject({
      ok: true,
      anchor: { block_id: 'l1', kind: 'list', path: [0], snapshot: 'Item one' },
    })
    const nested = textNodeOf('li[data-block-id="i2"]')
    expect(anchorFromRange(makeRange(nested, 0, nested, 6), scope)).toMatchObject({
      ok: true,
      anchor: { block_id: 'l1', kind: 'list', path: [0, 0], snapshot: 'Nested' },
    })
    const second = textNodeOf('li[data-block-id="i3"]')
    expect(anchorFromRange(makeRange(second, 0, second, 8), scope)).toMatchObject({
      ok: true,
      anchor: { path: [1], snapshot: 'Item two' },
    })
    // Outer line → nested item spans two runs.
    expect(anchorFromRange(makeRange(outer, 0, nested, 3), scope)).toMatchObject({
      ok: false,
      reason: 'multi-block',
    })
  })

  it('toggle: the summary is the prose run; body blocks anchor as themselves', () => {
    const summary = textNodeOf('[data-block-id="tg1"] summary')
    expect(anchorFromRange(makeRange(summary, 0, summary, 6), scope)).toMatchObject({
      ok: true,
      anchor: { block_id: 'tg1', kind: 'prose', path: [], snapshot: 'Toggle' },
    })
    const body = textNodeOf('[data-block-id="p2"]')
    expect(anchorFromRange(makeRange(body, 0, body, 4), scope)).toMatchObject({
      ok: true,
      anchor: { block_id: 'p2', kind: 'prose', snapshot: 'Body' },
    })
  })

  it('inline equations are atomic: offsets use the TeX source, edges snap outward', () => {
    // Run: 'Before ' + 'E=mc^2' (aria-label) + ' after' — never the KaTeX
    // markup's own text content.
    const before = textNodeOf('[data-block-id="pe1"]')
    const insideKatex = textNodeOf('[data-block-id="pe1"] .rt-inline-equation [aria-hidden]')
    const result = anchorFromRange(makeRange(before, 0, insideKatex, 3), scope)
    expect(result).toMatchObject({
      ok: true,
      anchor: { block_id: 'pe1', start: 0, end: 13, snapshot: 'Before E=mc^2' },
    })
  })

  it('rejects collapsed, cross-block, whitespace-only, and >1000-char selections', () => {
    const p1 = textNodeOf('[data-block-id="p1"]')
    expect(anchorFromRange(makeRange(p1, 1, p1, 1), scope)).toMatchObject({
      ok: false,
      reason: 'collapsed',
    })
    const other = textNodeOf('[data-block-id="pe1"]')
    expect(anchorFromRange(makeRange(p1, 0, other, 3), scope)).toMatchObject({
      ok: false,
      reason: 'multi-block',
    })
    expect(anchorFromRange(makeRange(p1, 5, p1, 6), scope)).toMatchObject({
      ok: false,
      reason: 'empty',
    })

    const long = document.createElement('p')
    long.setAttribute('data-block-id', 'long1')
    long.textContent = 'x'.repeat(1200)
    scope.append(long)
    const longText = long.firstChild as Text
    expect(anchorFromRange(makeRange(longText, 0, longText, 1200), scope)).toMatchObject({
      ok: false,
      reason: 'too-long',
    })
  })
})

describe('rangeForAnchor (paint/glyph side)', () => {
  it('round-trips an anchor back to the exact DOM range', () => {
    const p1 = textNodeOf('[data-block-id="p1"]')
    const created = anchorFromRange(
      makeRange(p1, 2, textNodeOf('[data-block-id="p1"] strong'), 3),
      scope,
    )
    if (!created.ok) throw new Error('fixture anchor failed')
    const range = rangeForAnchor(scope, created.anchor)
    expect(range?.toString()).toBe('pha bet')
  })

  it('refuses stale anchors: snapshot mismatch and missing blocks paint nothing', () => {
    expect(
      rangeForAnchor(scope, {
        block_id: 'p1',
        kind: 'prose',
        path: [],
        start: 0,
        end: 5,
        snapshot: 'WRONG',
      }),
    ).toBeNull()
    expect(
      rangeForAnchor(scope, {
        block_id: 'ghost',
        kind: 'prose',
        path: [],
        start: 0,
        end: 5,
        snapshot: 'Alpha',
      }),
    ).toBeNull()
  })

  it('spans separator pieces (multi-paragraph callout runs)', () => {
    const root = resolveBlockRoot(
      textNodeOf('[data-block-id="c1"] p:nth-of-type(2)'),
      scope,
    ) as BlockRoot
    const map = collectRunMap(root, [])
    expect(map?.text).toBe('First para\nSecond para')
    const range = rangeForAnchor(scope, {
      block_id: 'c1',
      kind: 'prose',
      path: [],
      start: 6,
      end: 17,
      snapshot: 'para\nSecond',
    })
    expect(range).not.toBeNull()
    // DOM has no literal newline between the two <p>s.
    expect(range?.toString()).toBe('paraSecond')
  })
})

describe('runPositionForDomPoint (click hit-testing)', () => {
  it('maps a DOM point to its run offset', () => {
    const strongText = textNodeOf('[data-block-id="p1"] strong')
    expect(runPositionForDomPoint(scope, strongText, 2)).toEqual({
      blockId: 'p1',
      kind: 'prose',
      path: [],
      offset: 8,
    })
  })
})
