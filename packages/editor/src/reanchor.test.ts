import { describe, expect, it } from 'vitest'

import type { AnchorKind, AnchorPath } from './anchors'
import { getAnchorKind, getTextRuns } from './anchors'
import { FIXTURE_DOCUMENT, LEGACY_FLAT_LIST_DOCUMENT } from './fixtures'
import type { AnchorV1, ReanchorHighlight, ReanchorResult } from './reanchor'
import { reanchorHighlights } from './reanchor'
import { upgradeLegacyLists } from './schema/legacy-lists'
import type {
  Block,
  BlockquoteBlock,
  CalloutBlock,
  CodeBlock,
  Content,
  DrugCardBlock,
  HeadingBlock,
  ImageBlock,
  ListBlock,
  ListItemContentNode,
  ListItemNode,
  NestedListNode,
  ParagraphBlock,
  TableBlock,
  TableCell,
  TableRow,
  ToggleBlock,
  VideoBlock,
} from './schema/types'

/* ------------------------------------------------------------- helpers */

const doc = (): Content => structuredClone(FIXTURE_DOCUMENT)
const legacy = (): Content => structuredClone(LEGACY_FLAT_LIST_DOCUMENT)

function findBlock(content: Content, id: string): Block {
  const block = content.find((candidate) => candidate.id === id)
  if (!block) throw new Error(`block not in document: ${id}`)
  return block
}

function removeBlock(content: Content, id: string): void {
  const index = content.findIndex((block) => block.id === id)
  if (index === -1) throw new Error(`block not in document: ${id}`)
  content.splice(index, 1)
}

/** Build a real anchor the way the creation side would: run text via
 * getTextRuns, offsets = code-unit indexOf of the selected text. */
function makeAnchor(
  content: Content,
  blockId: string,
  path: AnchorPath,
  selected: string,
): AnchorV1 {
  const block = findBlock(content, blockId)
  const kind = getAnchorKind(block)
  if (kind === null) throw new Error(`block not anchorable: ${blockId}`)
  const text = getTextRuns(block, path)
  if (text === null) throw new Error(`no run at ${blockId} ${JSON.stringify(path)}`)
  const start = text.indexOf(selected)
  if (start === -1) throw new Error(`selection not in run: ${selected}`)
  return {
    v: 1,
    block_id: blockId,
    kind,
    path,
    start,
    end: start + selected.length,
    snapshot: selected,
  }
}

function single(oldContent: unknown, newContent: unknown, anchor: unknown): ReanchorResult {
  const results = reanchorHighlights(oldContent, newContent, [{ id: 'h1', anchor }])
  expect(results).toHaveLength(1)
  return results[0] as ReanchorResult
}

function anchorOf(result: ReanchorResult): AnchorV1 {
  if (result.action !== 'repath' && result.action !== 'move') {
    throw new Error(`expected repath/move, got ${result.action}`)
  }
  return result.anchor
}

/** A returned anchor must actually resolve in the new document: run found,
 * slice equals snapshot, kind matches the block. Legacy flat lists are
 * upgraded first — the canonical addressing the renderer uses. */
function expectAnchorResolves(content: Content, anchor: AnchorV1): void {
  const canonical = upgradeLegacyLists(content)
  const block = findBlock(canonical, anchor.block_id)
  const text = getTextRuns(block, anchor.path)
  expect(text).not.toBeNull()
  expect((text as string).slice(anchor.start, anchor.end)).toBe(anchor.snapshot)
  expect(getAnchorKind(block)).toBe(anchor.kind)
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}

const p = (id: string, text: string): ParagraphBlock => ({ id, type: 'p', children: [{ text }] })
const cell = (text: string): TableCell => ({
  type: 'td',
  children: [{ type: 'p', children: [{ text }] }],
})
const tr = (...texts: string[]): TableRow => ({ type: 'tr', children: texts.map(cell) })
const codeBlock = (id: string, ...lines: string[]): CodeBlock => ({
  id,
  type: 'code_block',
  children: lines.map((text) => ({ type: 'code_line', children: [{ text }] })),
})

/* -------------------------------------------------- kind × outcome matrix */

type MatrixCase = {
  name: string
  blockId: string
  path: AnchorPath
  snapshot: string
  repath: { edit: (document: Content) => void; expectPath: AnchorPath }
  move: {
    edit: (document: Content) => void
    expectBlockId: string
    expectKind: AnchorKind
    expectPath: AnchorPath
  }
  orphan: { edit: (document: Content) => void }
}

const MATRIX: MatrixCase[] = [
  {
    name: 'prose: paragraph',
    blockId: 'fx-p-intro',
    path: [],
    snapshot: 'irreversibly inhibits cyclooxygenase',
    repath: {
      edit: (document) => {
        const block = findBlock(document, 'fx-p-intro') as ParagraphBlock
        block.children.unshift({ text: 'NEW CONTEXT — ' })
      },
      expectPath: [],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-p-intro')
        document.push(p('fx-p-new', 'Recall: irreversibly inhibits cyclooxygenase.'))
      },
      expectBlockId: 'fx-p-new',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: { edit: (document) => removeBlock(document, 'fx-p-intro') },
  },
  {
    name: 'prose: heading (whole-run selection, start 0)',
    blockId: 'fx-h2-pharmacokinetics',
    path: [],
    snapshot: 'Pharmacokinetics',
    repath: {
      edit: (document) => {
        const block = findBlock(document, 'fx-h2-pharmacokinetics') as HeadingBlock
        block.children = [{ text: 'Advanced Pharmacokinetics' }]
      },
      expectPath: [],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-h2-pharmacokinetics')
        document.push(p('fx-p-see', 'See Pharmacokinetics basics.'))
      },
      expectBlockId: 'fx-p-see',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: { edit: (document) => removeBlock(document, 'fx-h2-pharmacokinetics') },
  },
  {
    name: 'prose: blockquote',
    blockId: 'fx-blockquote',
    path: [],
    snapshot: 'dosage alone makes',
    repath: {
      edit: (document) => {
        const block = findBlock(document, 'fx-blockquote') as BlockquoteBlock
        block.children.unshift({ text: 'Paracelsus: ' })
      },
      expectPath: [],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-blockquote')
        document.push({
          id: 'fx-bq-new',
          type: 'blockquote',
          children: [{ text: 'the dosage alone makes the poison' }],
        })
      },
      expectBlockId: 'fx-bq-new',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: { edit: (document) => removeBlock(document, 'fx-blockquote') },
  },
  {
    name: 'prose: callout body (snapshot spans the paragraph join)',
    blockId: 'fx-callout-pearl',
    path: [],
    snapshot: 'absorption.\nChewing',
    repath: {
      edit: (document) => {
        const block = findBlock(document, 'fx-callout-pearl') as CalloutBlock
        block.children.unshift({ type: 'p', children: [{ text: 'Absorption pearls follow.' }] })
      },
      expectPath: [],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-callout-pearl')
        document.push({
          id: 'fx-callout-new',
          type: 'callout',
          variant: 'clinical_pearl',
          children: [
            {
              type: 'p',
              children: [{ text: 'Enteric coating delays but does not reduce absorption.' }],
            },
            { type: 'p', children: [{ text: 'Chewing non-coated aspirin speeds onset in ACS.' }] },
          ],
        })
      },
      expectBlockId: 'fx-callout-new',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: { edit: (document) => removeBlock(document, 'fx-callout-pearl') },
  },
  {
    name: 'prose: toggle summary',
    blockId: 'fx-toggle-details',
    path: [],
    snapshot: 'salicylate kinetics',
    repath: {
      edit: (document) => {
        const block = findBlock(document, 'fx-toggle-details') as ToggleBlock
        block.children.unshift({ text: 'Deep dive — ' })
      },
      expectPath: [],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-toggle-details')
        document.push({
          id: 'fx-h3-new',
          type: 'h3',
          children: [{ text: 'More salicylate kinetics' }],
        })
      },
      expectBlockId: 'fx-h3-new',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: { edit: (document) => removeBlock(document, 'fx-toggle-details') },
  },
  {
    name: 'list: top-level item',
    blockId: 'fx-ul-absorption',
    path: [0],
    snapshot: 'Rapid gastric absorption',
    repath: {
      edit: (document) => {
        const list = findBlock(document, 'fx-ul-absorption') as ListBlock
        list.children.unshift({
          type: 'li',
          children: [{ type: 'lic', children: [{ text: 'Buccal absorption is negligible' }] }],
        })
      },
      expectPath: [1],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-ul-absorption')
        document.push(p('fx-p-rapid', 'Rapid gastric absorption persists.'))
      },
      expectBlockId: 'fx-p-rapid',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: {
      edit: (document) => {
        const list = findBlock(document, 'fx-ul-absorption') as ListBlock
        list.children.splice(0, 1)
      },
    },
  },
  {
    name: 'list: nested item (promoted within its list)',
    blockId: 'fx-ul-absorption',
    path: [1, 0],
    snapshot: 'Albumin binding ~90%',
    repath: {
      edit: (document) => {
        const list = findBlock(document, 'fx-ul-absorption') as ListBlock
        const item = list.children[1] as ListItemNode
        const nested = item.children[1] as NestedListNode
        item.children = [item.children[0] as ListItemContentNode]
        list.children.push(...nested.children)
      },
      expectPath: [2],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-ul-absorption')
        const steps = findBlock(document, 'fx-ol-steps') as ListBlock
        steps.children.push({
          type: 'li',
          children: [{ type: 'lic', children: [{ text: 'Albumin binding ~90%' }] }],
        })
      },
      expectBlockId: 'fx-ol-steps',
      expectKind: 'list',
      expectPath: [2],
    },
    orphan: {
      edit: (document) => {
        const list = findBlock(document, 'fx-ul-absorption') as ListBlock
        const item = list.children[1] as ListItemNode
        item.children = [item.children[0] as ListItemContentNode]
      },
    },
  },
  {
    name: 'table: cell',
    blockId: 'fx-table-doses',
    path: [1, 0],
    snapshot: 'Antiplatelet',
    repath: {
      edit: (document) => {
        const table = findBlock(document, 'fx-table-doses') as TableBlock
        table.children.splice(1, 0, tr('Prophylaxis', '75 mg'))
      },
      expectPath: [2, 0],
    },
    move: {
      // Deleting the table leaves exactly one 'Antiplatelet' — inside the
      // mnemonic callout. A cross-kind move: table → prose.
      edit: (document) => removeBlock(document, 'fx-table-doses'),
      expectBlockId: 'fx-callout-mnemonic',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: {
      edit: (document) => {
        removeBlock(document, 'fx-table-doses')
        removeBlock(document, 'fx-callout-mnemonic')
      },
    },
  },
  {
    name: 'drugcard: field',
    blockId: 'fx-drugcard-aspirin',
    path: ['adverse_effects'],
    snapshot: 'tinnitus, bronchospasm',
    repath: {
      // The author moves the text to another field: path drift key→key.
      edit: (document) => {
        const card = findBlock(document, 'fx-drugcard-aspirin') as DrugCardBlock
        delete card.fields.adverse_effects
        card.fields.monitoring = 'GI bleeding, tinnitus, bronchospasm'
      },
      expectPath: ['monitoring'],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-drugcard-aspirin')
        document.push(p('fx-p-adverse', 'Watch for tinnitus, bronchospasm early.'))
      },
      expectBlockId: 'fx-p-adverse',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: {
      edit: (document) => {
        const card = findBlock(document, 'fx-drugcard-aspirin') as DrugCardBlock
        delete card.fields.adverse_effects
      },
    },
  },
  {
    name: 'code: line (whole-line selection)',
    blockId: 'fx-code-calc',
    path: [1],
    snapshot: 'maintenance = CL × Cp_ss × tau',
    repath: {
      edit: (document) => {
        const code = findBlock(document, 'fx-code-calc') as CodeBlock
        code.children.unshift({ type: 'code_line', children: [{ text: '# dosing formulas' }] })
      },
      expectPath: [2],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-code-calc')
        document.push(codeBlock('fx-code-new', 'maintenance = CL × Cp_ss × tau'))
      },
      expectBlockId: 'fx-code-new',
      expectKind: 'code',
      expectPath: [0],
    },
    orphan: {
      edit: (document) => {
        const code = findBlock(document, 'fx-code-calc') as CodeBlock
        code.children.splice(1, 1)
      },
    },
  },
  {
    name: 'caption: image',
    blockId: 'fx-img-structure',
    path: ['caption'],
    snapshot: 'Acetylsalicylic acid',
    repath: {
      edit: (document) => {
        const image = findBlock(document, 'fx-img-structure') as ImageBlock
        image.caption = [{ text: 'FIG 1a — Structure of Acetylsalicylic acid' }]
      },
      expectPath: ['caption'],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-img-structure')
        document.push({
          id: 'fx-img-new',
          type: 'img',
          url: 'https://cdn.example.com/content-media/aspirin-3d.webp',
          alt: 'Aspirin 3D model',
          asset_id: '5c936ed7-53c1-4b6f-b264-1bb9a2f6b3c4',
          width: 800,
          height: 600,
          caption: [{ text: 'Acetylsalicylic acid, revisited' }],
          children: [{ text: '' }],
        })
      },
      expectBlockId: 'fx-img-new',
      expectKind: 'caption',
      expectPath: ['caption'],
    },
    orphan: {
      edit: (document) => {
        const image = findBlock(document, 'fx-img-structure') as ImageBlock
        delete image.caption
      },
    },
  },
  {
    name: 'caption: video',
    blockId: 'fx-video-mechanism',
    path: ['caption'],
    snapshot: 'COX inhibition, step by step',
    repath: {
      edit: (document) => {
        const video = findBlock(document, 'fx-video-mechanism') as VideoBlock
        video.caption = [{ text: 'VIDEO 2 — COX inhibition, step by step' }]
      },
      expectPath: ['caption'],
    },
    move: {
      edit: (document) => {
        removeBlock(document, 'fx-video-mechanism')
        document.push(p('fx-p-video', 'COX inhibition, step by step, matters.'))
      },
      expectBlockId: 'fx-p-video',
      expectKind: 'prose',
      expectPath: [],
    },
    orphan: {
      edit: (document) => {
        const video = findBlock(document, 'fx-video-mechanism') as VideoBlock
        video.caption = [{ text: 'VIDEO — watch the animation' }]
      },
    },
  },
]

describe('matrix: keep (M1 §5.5 step 1)', () => {
  it.each(MATRIX)('$name — unchanged document', (matrixCase) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, matrixCase.blockId, matrixCase.path, matrixCase.snapshot)
    expect(single(oldDocument, doc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it.each(MATRIX)('$name — document edited elsewhere', (matrixCase) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, matrixCase.blockId, matrixCase.path, matrixCase.snapshot)
    const newDocument = doc()
    const styled = findBlock(newDocument, 'fx-p-styled') as ParagraphBlock
    styled.children = [{ text: 'Entirely rewritten unrelated paragraph.' }]
    newDocument.push(p('fx-p-added', 'A brand new closing remark.'))
    expect(single(oldDocument, newDocument, anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it.each(MATRIX)('$name — whole block moved within the document', (matrixCase) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, matrixCase.blockId, matrixCase.path, matrixCase.snapshot)
    const newDocument = doc()
    const index = newDocument.findIndex((block) => block.id === matrixCase.blockId)
    const [moved] = newDocument.splice(index, 1)
    newDocument.unshift(moved as Block)
    expect(single(oldDocument, newDocument, anchor)).toEqual({ id: 'h1', action: 'keep' })
  })
})

describe('matrix: repath (M1 §5.5 step 2)', () => {
  it.each(MATRIX)('$name', (matrixCase) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, matrixCase.blockId, matrixCase.path, matrixCase.snapshot)
    const newDocument = doc()
    matrixCase.repath.edit(newDocument)

    const result = single(oldDocument, newDocument, anchor)
    expect(result.action).toBe('repath')
    const next = anchorOf(result)
    expect(next.v).toBe(1)
    expect(next.block_id).toBe(matrixCase.blockId)
    expect(next.path).toEqual(matrixCase.repath.expectPath)
    expect(next.snapshot).toBe(matrixCase.snapshot)
    expect(next.end - next.start).toBe(matrixCase.snapshot.length)
    const runText = getTextRuns(
      findBlock(newDocument, matrixCase.blockId),
      matrixCase.repath.expectPath,
    )
    expect(next.start).toBe((runText as string).indexOf(matrixCase.snapshot))
    expectAnchorResolves(newDocument, next)
    // A repath is never a disguised keep: something moved.
    expect([next.kind, next.path, next.start, next.end]).not.toEqual([
      anchor.kind,
      anchor.path,
      anchor.start,
      anchor.end,
    ])
  })
})

describe('matrix: move (M1 §5.5 step 3)', () => {
  it.each(MATRIX)('$name', (matrixCase) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, matrixCase.blockId, matrixCase.path, matrixCase.snapshot)
    const newDocument = doc()
    matrixCase.move.edit(newDocument)

    const result = single(oldDocument, newDocument, anchor)
    expect(result.action).toBe('move')
    const next = anchorOf(result)
    expect(next.v).toBe(1)
    expect(next.block_id).toBe(matrixCase.move.expectBlockId)
    expect(next.kind).toBe(matrixCase.move.expectKind)
    expect(next.path).toEqual(matrixCase.move.expectPath)
    expect(next.snapshot).toBe(matrixCase.snapshot)
    expect(next.end - next.start).toBe(matrixCase.snapshot.length)
    expectAnchorResolves(newDocument, next)
  })
})

describe('matrix: orphan (M1 §5.5 step 4)', () => {
  it.each(MATRIX)('$name', (matrixCase) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, matrixCase.blockId, matrixCase.path, matrixCase.snapshot)
    const newDocument = doc()
    matrixCase.orphan.edit(newDocument)
    expect(single(oldDocument, newDocument, anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })
})

/* ------------------------------------------------------------ precedence */

describe('precedence details', () => {
  it('same-block occurrence (repath) outranks a unique occurrence elsewhere (move)', () => {
    const oldDocument: Content = [p('b1', 'the needle text'), p('b2', 'other prose')]
    const anchor = makeAnchor(oldDocument, 'b1', [], 'needle')
    const newDocument: Content = [
      p('b1', 'shifted: the needle text'),
      p('b2', 'a needle elsewhere'),
    ]
    const result = single(oldDocument, newDocument, anchor)
    expect(result.action).toBe('repath')
    expect(anchorOf(result).block_id).toBe('b1')
    expectAnchorResolves(newDocument, anchorOf(result))
  })

  it('block survives but the snapshot left it → unique elsewhere is a move', () => {
    const oldDocument: Content = [p('b1', 'the needle sits here'), p('b2', 'elsewhere text')]
    const anchor = makeAnchor(oldDocument, 'b1', [], 'needle')
    const newDocument: Content = [p('b1', 'completely rewritten'), p('b2', 'elsewhere text needle')]
    const result = single(oldDocument, newDocument, anchor)
    expect(result.action).toBe('move')
    expect(anchorOf(result).block_id).toBe('b2')
    expectAnchorResolves(newDocument, anchorOf(result))
  })

  it('ambiguous duplicates orphan: block gone, snapshot twice across blocks', () => {
    const oldDocument = doc()
    oldDocument.push(p('tmp-reye', 'Reye syndrome overview'))
    const anchor = makeAnchor(oldDocument, 'tmp-reye', [], 'Reye syndrome')
    // 'Reye syndrome' survives in BOTH the exam_alert and warning callouts.
    expect(single(oldDocument, doc(), anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('ambiguous duplicates orphan: snapshot twice within a single run', () => {
    const oldDocument: Content = [p('b1', 'needle')]
    const anchor = makeAnchor(oldDocument, 'b1', [], 'needle')
    const newDocument: Content = [p('b2', 'needle and then needle again')]
    expect(single(oldDocument, newDocument, anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('overlapping occurrences count toward ambiguity', () => {
    const oldDocument: Content = [p('b1', 'aa')]
    const anchor = makeAnchor(oldDocument, 'b1', [], 'aa')
    // 'aaa' contains 'aa' at 0 and 1 — two occurrences, not one.
    const newDocument: Content = [p('b2', 'aaa')]
    expect(single(oldDocument, newDocument, anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('a stale kind with still-valid path/offsets is corrected via repath', () => {
    const text = getTextRuns(findBlock(doc(), 'fx-code-calc'), [1]) as string
    const anchor = {
      v: 1,
      block_id: 'fx-code-calc',
      kind: 'list',
      path: [1],
      start: 0,
      end: text.length,
      snapshot: text,
    }
    const result = single(doc(), doc(), anchor)
    expect(result.action).toBe('repath')
    const next = anchorOf(result)
    expect(next.kind).toBe('code')
    expect(next.path).toEqual([1])
    expect(next.start).toBe(0)
  })

  it('a stale end offset self-heals via repath at the same spot', () => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, 'fx-p-outro', [], 'monitoring parameters')
    const stale = { ...anchor, end: anchor.end + 3 }
    const result = single(oldDocument, doc(), stale)
    expect(result.action).toBe('repath')
    const next = anchorOf(result)
    expect(next.start).toBe(anchor.start)
    expect(next.end).toBe(anchor.end)
  })
})

/* ------------------------------------------------------------ tie-breaks */

describe('repath tie-breaks (documented order)', () => {
  it('same run, equidistant occurrences → the earlier one', () => {
    const oldDocument: Content = [p('b1', 'xxxxalphayyyy')]
    const anchor = makeAnchor(oldDocument, 'b1', [], 'alpha') // start 4
    const newDocument: Content = [p('b1', 'alphaZZZalpha')] // occurrences at 0 and 8
    const next = anchorOf(single(oldDocument, newDocument, anchor))
    expect(next.start).toBe(0)
  })

  it('same run, unequal distances → the offset-closest occurrence', () => {
    const oldDocument: Content = [p('b1', 'AAAAAAalpha')]
    const anchor = makeAnchor(oldDocument, 'b1', [], 'alpha') // start 6
    const newDocument: Content = [p('b1', 'ZZalphaalpha')] // occurrences at 2 and 7
    const next = anchorOf(single(oldDocument, newDocument, anchor))
    expect(next.start).toBe(7)
  })

  it('the old path beats an offset-closer occurrence in a sibling run', () => {
    const oldDocument: Content = [{ id: 't1', type: 'table', children: [tr('needle here')] }]
    const anchor = makeAnchor(oldDocument, 't1', [0, 0], 'needle') // start 0
    const newDocument: Content = [
      { id: 't1', type: 'table', children: [tr('pre needle'), tr('needle')] },
    ]
    const next = anchorOf(single(oldDocument, newDocument, anchor))
    expect(next.path).toEqual([0, 0])
    expect(next.start).toBe(4)
  })

  it('old path exists without the snapshot → nearest run in document order', () => {
    const oldDocument: Content = [codeBlock('c1', 'aaa', 'bbb', 'needle x')]
    const anchor = makeAnchor(oldDocument, 'c1', [2], 'needle')
    const newDocument: Content = [codeBlock('c1', 'needle one', 'bbb', 'ccc', 'needle two')]
    // Old run index 2; |0−2| = 2 vs |3−2| = 1 → line [3].
    const next = anchorOf(single(oldDocument, newDocument, anchor))
    expect(next.path).toEqual([3])
  })

  it('old path vanished → its would-be position anchors the run distance', () => {
    const anchor = {
      v: 1,
      block_id: 'c1',
      kind: 'code',
      path: [5],
      start: 0,
      end: 6,
      snapshot: 'needle',
    }
    const newDocument: Content = [codeBlock('c1', 'needle a', 'x', 'needle b')]
    // Insertion point of [5] among [[0],[1],[2]] is 3; |2−3| < |0−3| → [2].
    const next = anchorOf(single([], newDocument, anchor))
    expect(next.path).toEqual([2])
  })
})

/* ------------------------------------------- boundaries & creation parity */

describe('run boundaries and creation-side parity', () => {
  it('whole-run selection (start 0, end = length) keeps, join newline included', () => {
    const fullText = getTextRuns(findBlock(doc(), 'fx-callout-pearl'), []) as string
    const anchor = makeAnchor(doc(), 'fx-callout-pearl', [], fullText)
    expect(anchor.start).toBe(0)
    expect(anchor.end).toBe(fullText.length)
    expect(single(doc(), doc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it('editing after the selection end still keeps (offsets untouched)', () => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, 'fx-p-outro', [], 'Review the monitoring')
    const newDocument = doc()
    const outro = findBlock(newDocument, 'fx-p-outro') as ParagraphBlock
    outro.children.push({ text: ' Also see the appendix.' })
    expect(single(oldDocument, newDocument, anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it('selection ending exactly at the end of a shortened run repaths', () => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, 'fx-p-outro', [], 'the next unit.')
    const newDocument = doc()
    const outro = findBlock(newDocument, 'fx-p-outro') as ParagraphBlock
    outro.children = [{ text: 'See the next unit.' }]
    const next = anchorOf(single(oldDocument, newDocument, anchor))
    expect(next.start).toBe(4)
    expect(next.end).toBe('See the next unit.'.length)
    expectAnchorResolves(newDocument, next)
  })

  it('a selection spanning an inline equation matches the serialized TeX', () => {
    // inlineText serializes inline_equation as its TeX source — the same
    // string the creation side sees, so anchors across it keep.
    const anchor = makeAnchor(doc(), 'fx-p-inline-equation', [], 'follows CL = k_e')
    expect(single(doc(), doc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })
})

/* ------------------------------------------------------------- multi-byte */

describe('multi-byte text (UTF-16 code-unit offsets)', () => {
  const ARABIC_TEXT = 'الأسبرين يثبط الإنزيم 💊 بشكل دائم'
  const PREFIX = 'ملاحظة: '
  const arabicDoc = (text: string = ARABIC_TEXT): Content => [p('b-ar', text)]

  it('an emoji selection round-trips (surrogate pair = 2 code units)', () => {
    const anchor = makeAnchor(arabicDoc(), 'b-ar', [], '💊 بشكل')
    expect(anchor.end - anchor.start).toBe('💊 بشكل'.length)
    expect(single(arabicDoc(), arabicDoc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it('offsets past an emoji stay code-unit consistent through a repath', () => {
    const anchor = makeAnchor(arabicDoc(), 'b-ar', [], 'بشكل دائم')
    expect(single(arabicDoc(), arabicDoc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
    const edited = arabicDoc(PREFIX + ARABIC_TEXT)
    const result = single(arabicDoc(), edited, anchor)
    expect(result.action).toBe('repath')
    const next = anchorOf(result)
    expect(next.start).toBe(anchor.start + PREFIX.length)
    expectAnchorResolves(edited, next)
  })

  it('Arabic snapshots move like any other text', () => {
    const oldDocument = arabicDoc()
    const anchor = makeAnchor(oldDocument, 'b-ar', [], 'يثبط الإنزيم')
    const newDocument: Content = [p('b-other', `ملخص: ${'يثبط الإنزيم'} تمامًا`)]
    const result = single(oldDocument, newDocument, anchor)
    expect(result.action).toBe('move')
    expectAnchorResolves(newDocument, anchorOf(result))
  })
})

/* ------------------------------------------------- malformed & defensive */

describe('malformed anchors → orphan, never throw', () => {
  const validBase = (): AnchorV1 =>
    makeAnchor(doc(), 'fx-h2-pharmacokinetics', [], 'Pharmacokinetics')

  const missingKind: Record<string, unknown> = { ...validBase() }
  delete missingKind.kind
  const missingSnapshot: Record<string, unknown> = { ...validBase() }
  delete missingSnapshot.snapshot

  const MALFORMED: Array<{ name: string; anchor: unknown }> = [
    { name: 'null', anchor: null },
    { name: 'undefined', anchor: undefined },
    { name: 'number', anchor: 7 },
    { name: 'string', anchor: 'anchor' },
    { name: 'array', anchor: [] },
    { name: 'empty object', anchor: {} },
    { name: 'wrong version', anchor: { ...validBase(), v: 2 } },
    { name: 'string version', anchor: { ...validBase(), v: '1' } },
    { name: 'unknown kind', anchor: { ...validBase(), kind: 'paragraph' } },
    { name: 'missing kind', anchor: missingKind },
    { name: 'non-string block_id', anchor: { ...validBase(), block_id: 42 } },
    { name: 'empty block_id', anchor: { ...validBase(), block_id: '' } },
    { name: 'path not an array', anchor: { ...validBase(), path: 'nope' } },
    { name: 'fractional path index', anchor: { ...validBase(), path: [1.5] } },
    { name: 'negative path index', anchor: { ...validBase(), path: [-1] } },
    { name: 'null path segment', anchor: { ...validBase(), path: [null] } },
    { name: 'string start', anchor: { ...validBase(), start: '0' } },
    { name: 'negative start', anchor: { ...validBase(), start: -1 } },
    { name: 'fractional start', anchor: { ...validBase(), start: 0.5 } },
    { name: 'NaN start', anchor: { ...validBase(), start: Number.NaN } },
    { name: 'end before start', anchor: { ...validBase(), start: 5, end: 2 } },
    { name: 'non-string snapshot', anchor: { ...validBase(), snapshot: 42 } },
    { name: 'missing snapshot', anchor: missingSnapshot },
    { name: 'empty snapshot', anchor: { ...validBase(), snapshot: '' } },
    { name: 'oversized snapshot (>1000)', anchor: { ...validBase(), snapshot: 'x'.repeat(1001) } },
  ]

  it.each(MALFORMED)('$name', ({ anchor }) => {
    expect(single(doc(), doc(), anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('unknown EXTRA anchor properties are tolerated (future minor revisions)', () => {
    const anchor = { ...validBase(), future_hint: 'ignore me' }
    expect(single(doc(), doc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })
})

describe('defensive content handling', () => {
  it('empty newContent orphans everything without throwing', () => {
    const oldDocument = doc()
    const highlights: ReanchorHighlight[] = [
      { id: 'a', anchor: makeAnchor(oldDocument, 'fx-p-intro', [], 'Aspirin') },
      { id: 'b', anchor: makeAnchor(oldDocument, 'fx-table-doses', [0, 1], 'Dose') },
    ]
    expect(reanchorHighlights(oldDocument, [], highlights)).toEqual([
      { id: 'a', action: 'orphan' },
      { id: 'b', action: 'orphan' },
    ])
  })

  it.each([
    { name: 'null', content: null },
    { name: 'undefined', content: undefined },
    { name: 'string', content: 'garbage' },
    { name: 'number', content: 42 },
    { name: 'object', content: {} },
  ])('non-array newContent ($name) orphans without throwing', ({ content }) => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, 'fx-p-intro', [], 'Aspirin')
    expect(single(oldDocument, content, anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('non-block entries and broken block internals are skipped, not fatal', () => {
    const newContent: unknown = [
      null,
      42,
      'x',
      { id: 'martian-1', type: 'martian' },
      { id: 'broken-p', type: 'p', children: 7 },
      p('b1', 'needle here'),
    ]
    const okAnchor = makeAnchor([p('b1', 'needle here')], 'b1', [], 'needle')
    const brokenAnchor = {
      v: 1,
      block_id: 'broken-p',
      kind: 'prose',
      path: [],
      start: 0,
      end: 3,
      snapshot: 'zzz',
    }
    expect(
      reanchorHighlights([], newContent, [
        { id: 'a', anchor: okAnchor },
        { id: 'b', anchor: brokenAnchor },
      ]),
    ).toEqual([
      { id: 'a', action: 'keep' },
      { id: 'b', action: 'orphan' },
    ])
  })

  it('text inside column groups is not anchorable — anchors there orphan', () => {
    const anchor = {
      v: 1,
      block_id: 'fx-columns',
      kind: 'prose',
      path: [],
      start: 0,
      end: 31,
      snapshot: 'COX-2: inducible, inflammation.',
    }
    expect(single(doc(), doc(), anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('block equations have no runs — anchors on them orphan', () => {
    const anchor = {
      v: 1,
      block_id: 'fx-equation-henderson',
      kind: 'prose',
      path: [],
      start: 0,
      end: 9,
      snapshot: 'pH = pK_a',
    }
    expect(single(doc(), doc(), anchor)).toEqual({ id: 'h1', action: 'orphan' })
  })

  it('duplicate block ids: the first block (document order) wins lookups', () => {
    const newDocument: Content = [p('dup', 'first needle'), p('dup', 'second thing')]
    const anchor = makeAnchor([p('dup', 'first needle')], 'dup', [], 'first needle')
    expect(single([], newDocument, anchor)).toEqual({ id: 'h1', action: 'keep' })
  })
})

/* --------------------------------------------------- legacy list upgrade */

describe('schema-v2 legacy flat-list interaction', () => {
  const canonicalLegacy = (): Content => upgradeLegacyLists(legacy())

  it('a v2 list anchor keeps against content still stored flat (v1)', () => {
    const anchor = makeAnchor(
      canonicalLegacy(),
      'lg-li-absorption',
      [1],
      'Wide distribution, protein-bound',
    )
    expect(single(legacy(), legacy(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it('a pre-v2 per-item prose anchor moves to its container list path', () => {
    // v1 flat items were their own prose blocks; after the upgrade the
    // container carries the FIRST item's id, so 'lg-li-distribution' no
    // longer exists as a block — the snapshot is unique, so it moves.
    const snapshot = 'Wide distribution, protein-bound'
    const anchor = {
      v: 1,
      block_id: 'lg-li-distribution',
      kind: 'prose',
      path: [],
      start: 0,
      end: snapshot.length,
      snapshot,
    }
    const result = single(legacy(), legacy(), anchor)
    expect(result.action).toBe('move')
    const next = anchorOf(result)
    expect(next.block_id).toBe('lg-li-absorption')
    expect(next.kind).toBe('list')
    expect(next.path).toEqual([1])
    expect(next.start).toBe(0)
    expectAnchorResolves(legacy(), next)
  })

  it('a prose anchor on the container id repaths to a list path (kind re-derived)', () => {
    const snapshot = 'Rapid gastric absorption'
    const anchor = {
      v: 1,
      block_id: 'lg-li-absorption',
      kind: 'prose',
      path: [],
      start: 0,
      end: snapshot.length,
      snapshot,
    }
    const result = single(legacy(), legacy(), anchor)
    expect(result.action).toBe('repath')
    const next = anchorOf(result)
    expect(next.block_id).toBe('lg-li-absorption')
    expect(next.kind).toBe('list')
    expect(next.path).toEqual([0])
    expect(next.start).toBe(0)
    expectAnchorResolves(legacy(), next)
  })

  it('flat and pre-upgraded new content produce identical results', () => {
    const highlights: ReanchorHighlight[] = [
      {
        id: 'keep',
        anchor: makeAnchor(canonicalLegacy(), 'lg-li-absorption', [1, 0], 'Albumin binding ~90%'),
      },
      {
        id: 'ordered',
        anchor: makeAnchor(canonicalLegacy(), 'lg-ol-step-1', [1], 'Hepatic conjugation'),
      },
      { id: 'gone', anchor: null },
    ]
    const flat = reanchorHighlights(legacy(), legacy(), highlights)
    const upgraded = reanchorHighlights(legacy(), canonicalLegacy(), highlights)
    expect(flat).toEqual(upgraded)
    expect(flat).toEqual([
      { id: 'keep', action: 'keep' },
      { id: 'ordered', action: 'keep' },
      { id: 'gone', action: 'orphan' },
    ])
  })
})

/* ----------------------------------------------- batches, purity, order */

describe('batch behavior, purity, determinism', () => {
  it('overlapping highlights on one block resolve independently', () => {
    const oldDocument = doc()
    const first = makeAnchor(oldDocument, 'fx-p-intro', [], 'irreversibly inhibits')
    const second = makeAnchor(oldDocument, 'fx-p-intro', [], 'inhibits cyclooxygenase')

    expect(
      reanchorHighlights(oldDocument, doc(), [
        { id: 'a', anchor: first },
        { id: 'b', anchor: second },
      ]),
    ).toEqual([
      { id: 'a', action: 'keep' },
      { id: 'b', action: 'keep' },
    ])

    const newDocument = doc()
    const intro = findBlock(newDocument, 'fx-p-intro') as ParagraphBlock
    intro.children.unshift({ text: 'PREFIX — ' })
    const results = reanchorHighlights(oldDocument, newDocument, [
      { id: 'a', anchor: first },
      { id: 'b', anchor: second },
    ])
    expect(results.map((result) => result.action)).toEqual(['repath', 'repath'])
    for (const result of results) expectAnchorResolves(newDocument, anchorOf(result))
  })

  it('results come back in input order, one per highlight', () => {
    const oldDocument = doc()
    const newDocument = doc()
    removeBlock(newDocument, 'fx-h2-pharmacokinetics')
    newDocument.push(p('fx-p-see', 'See Pharmacokinetics basics.'))
    const results = reanchorHighlights(oldDocument, newDocument, [
      { id: 'bad', anchor: { v: 3 } },
      { id: 'ok', anchor: makeAnchor(oldDocument, 'fx-p-intro', [], 'Aspirin irreversibly') },
      {
        id: 'moved',
        anchor: makeAnchor(oldDocument, 'fx-h2-pharmacokinetics', [], 'Pharmacokinetics'),
      },
    ])
    expect(results.map((result) => result.id)).toEqual(['bad', 'ok', 'moved'])
    expect(results.map((result) => result.action)).toEqual(['orphan', 'keep', 'move'])
  })

  it('empty highlight batches yield empty results', () => {
    expect(reanchorHighlights(doc(), doc(), [])).toEqual([])
  })

  it('oldContent is never consulted — the anchor is the old-location record', () => {
    const anchor = makeAnchor(doc(), 'fx-p-intro', [], 'Aspirin irreversibly')
    expect(single(null, doc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
    expect(single('garbage', doc(), anchor)).toEqual({ id: 'h1', action: 'keep' })
  })

  it('never mutates its inputs (deep-frozen inputs pass through)', () => {
    const oldDocument = deepFreeze(doc())
    const newDocument = deepFreeze(doc())
    const highlights = deepFreeze([
      { id: 'a', anchor: makeAnchor(doc(), 'fx-drugcard-aspirin', ['dosing'], '75–100 mg') },
      { id: 'b', anchor: null },
    ]) as ReanchorHighlight[]
    expect(reanchorHighlights(oldDocument, newDocument, highlights)).toEqual([
      { id: 'a', action: 'keep' },
      { id: 'b', action: 'orphan' },
    ])
  })

  it('never mutates frozen legacy content through the upgrade path', () => {
    const frozen = deepFreeze(legacy())
    const anchor = makeAnchor(upgradeLegacyLists(legacy()), 'lg-ol-step-1', [0], 'Hydrolysis')
    expect(reanchorHighlights(frozen, frozen, [{ id: 'a', anchor }])).toEqual([
      { id: 'a', action: 'keep' },
    ])
  })

  it('is deterministic: identical inputs, identical outputs', () => {
    const oldDocument = doc()
    const newDocument = doc()
    removeBlock(newDocument, 'fx-code-calc')
    newDocument.push(codeBlock('fx-code-new', 'maintenance = CL × Cp_ss × tau'))
    const highlights: ReanchorHighlight[] = [
      { id: 'a', anchor: makeAnchor(oldDocument, 'fx-code-calc', [1], 'CL × Cp_ss') },
      { id: 'b', anchor: makeAnchor(oldDocument, 'fx-ul-absorption', [1, 0], 'Albumin') },
      { id: 'c', anchor: { v: 1 } },
    ]
    const first = reanchorHighlights(oldDocument, newDocument, highlights)
    const second = reanchorHighlights(oldDocument, newDocument, highlights)
    expect(first).toEqual(second)
  })

  it('emitted anchors share no object identity with inputs', () => {
    const oldDocument = doc()
    const anchor = makeAnchor(oldDocument, 'fx-table-doses', [1, 0], 'Antiplatelet')
    const newDocument = doc()
    const table = findBlock(newDocument, 'fx-table-doses') as TableBlock
    table.children.splice(1, 0, tr('Prophylaxis', '75 mg'))
    const next = anchorOf(single(oldDocument, newDocument, anchor))
    expect(next).not.toBe(anchor)
    expect(next.path).not.toBe(anchor.path)
  })
})
