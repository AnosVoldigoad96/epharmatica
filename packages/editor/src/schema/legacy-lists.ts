import type {
  Block,
  Content,
  ListBlock,
  ListItemNode,
  ListStyleType,
  NestedListNode,
  ParagraphBlock,
} from './types'

/**
 * v1 → v2 list upgrade (dual-read, single-write).
 *
 * Schema v1 stored lists FLAT: each item was a top-level paragraph carrying
 * `listStyleType` (+ `indent` ≥ 2 for nesting). Schema v2 stores the whole
 * ul/ol as ONE container block. Nothing migrates in SQL — this pure
 * function upgrades v1 runs wherever stored content enters the system:
 *
 *  - `toEditorValue` (mount): the editor only ever sees containers;
 *  - `<RichText/>` (public render): one render path for both shapes;
 *  - `fromEditorValue` (save, defense-in-depth): a flat item that somehow
 *    reaches the save path still serializes as a container.
 *
 * Grouping mirrors the v1 renderer exactly: consecutive items of the SAME
 * listStyleType form one container (a style change or any non-list block
 * breaks the run); items deeper than the current level nest inside the
 * preceding item's li; a run that starts too deep clamps to the current
 * level. The container takes the FIRST item's id (one block = one anchor).
 *
 * `keepItemIds` tags each upgraded li with its v1 block id — renderer +
 * editor use it so existing per-item highlight anchors keep resolving in
 * the DOM. Storage never keeps li ids (the serializer strips nested ids;
 * strict validation rejects them).
 */

const isFlatListItem = (block: Block): block is ParagraphBlock & { listStyleType: ListStyleType } =>
  block.type === 'p' && block.listStyleType !== undefined

type UpgradeOptions = { keepItemIds?: boolean }

function buildLevel(
  items: (ParagraphBlock & { listStyleType: ListStyleType })[],
  style: ListStyleType,
  level: number,
  keepItemIds: boolean,
): ListItemNode[] {
  const out: ListItemNode[] = []
  let index = 0
  while (index < items.length) {
    const item = items[index] as ParagraphBlock & { listStyleType: ListStyleType }
    index += 1
    const deeper: (ParagraphBlock & { listStyleType: ListStyleType })[] = []
    while (index < items.length && ((items[index] as ParagraphBlock).indent ?? 1) > level) {
      deeper.push(items[index] as ParagraphBlock & { listStyleType: ListStyleType })
      index += 1
    }
    const lic = { type: 'lic' as const, children: item.children }
    const li: ListItemNode = { type: 'li', children: [lic] }
    if (keepItemIds) li.id = item.id
    if (deeper.length > 0) {
      const nested: NestedListNode = {
        type: style === 'decimal' ? 'ol' : 'ul',
        children: buildLevel(deeper, style, level + 1, keepItemIds),
      }
      li.children = [lic, nested]
    }
    out.push(li)
  }
  return out
}

function toContainer(
  items: (ParagraphBlock & { listStyleType: ListStyleType })[],
  keepItemIds: boolean,
): ListBlock {
  const first = items[0] as ParagraphBlock & { listStyleType: ListStyleType }
  return {
    id: first.id,
    type: first.listStyleType === 'decimal' ? 'ol' : 'ul',
    children: buildLevel(items, first.listStyleType, 1, keepItemIds),
  }
}

/** Upgrade every v1 flat-list run in `content` to a v2 container block.
 * Documents without flat items are returned as-is (same reference). */
export function upgradeLegacyLists(content: Content, options: UpgradeOptions = {}): Content {
  if (!content.some(isFlatListItem)) return content
  const keepItemIds = options.keepItemIds === true
  const out: Content = []
  let run: (ParagraphBlock & { listStyleType: ListStyleType })[] = []
  const flush = () => {
    if (run.length > 0) {
      out.push(toContainer(run, keepItemIds))
      run = []
    }
  }
  for (const block of content) {
    if (isFlatListItem(block)) {
      // A style change breaks the container (v1 renderer semantics).
      if (run.length > 0 && (run[0] as ParagraphBlock).listStyleType !== block.listStyleType) {
        flush()
      }
      run.push(block)
    } else {
      flush()
      out.push(block)
    }
  }
  flush()
  return out
}
