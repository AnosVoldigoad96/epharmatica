'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ContentLevel } from '@epharmatica/database'
import { Button, MonographLabel, useToast } from '@epharmatica/ui'
import { reorderNodes } from '@/features/content/actions'
import { MoveSheet } from './move-sheet'
import { NodeSheet } from './node-sheet'
import type { ListEditorData, ListRow, RowStatus } from './list-types'

/**
 * Per-level list editor (M4-1 · hi-fi 3aj): ink-hairlined table — ORD
 * (⇅ drag + up/down) · NAME/SLUG stacked · STATUS roll-up chip · SEM
 * (topics) · UPDATED · inline text actions Edit · Move… · Open ›. No
 * zebra; single hairlines; header rule in ink. Sheets handle create/edit
 * (incl. the rename ceremony) and Move….
 *
 * Chapter lists (flexible leaves, 020) render TWO groups in one table:
 * topics first, then the chapter's direct content pages — a KIND chip
 * distinguishes rows. The groups keep SEPARATE sort spaces (each
 * reorderable within itself; no cross-kind interleaving) and separate
 * create buttons/sheets/move targets.
 */

/** Which group a row lives in — 'pages' rows are chapter-attached subtopics. */
type RowGroup = 'primary' | 'pages'

const NO_ROWS: ListRow[] = []

function StatusChip({ status }: { status: RowStatus }) {
  const t = useTranslations('admin.content')
  let cls = 'border-line text-ink-2'
  let text: string

  if (status.kind === 'rollup') {
    if (status.total > 0 && status.published === status.total) {
      cls = 'border-primary text-primary'
      text = t('chips.published', { published: status.published, total: status.total })
    } else if (status.published > 0) {
      cls = 'border-warn/60 bg-warn/10 text-warn'
      text = t('chips.published', { published: status.published, total: status.total })
    } else {
      text = t('chips.draft')
    }
  } else {
    if (status.status === 'published') cls = 'border-primary text-primary'
    else if (status.status === 'in_review' || status.status === 'changes_requested') {
      cls = 'border-warn/60 bg-warn/10 text-warn'
    }
    text = t(`chips.status.${status.status}`)
  }

  return (
    <span
      className={`inline-block border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${cls}`}
    >
      {text}
    </span>
  )
}

function formatUpdated(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()
}

export function ListEditor({ data, heading }: { data: ListEditorData; heading: string }) {
  const t = useTranslations('admin.content')
  const router = useRouter()
  const { toast } = useToast()
  const [, startTransition] = useTransition()

  // Server refreshes replace the rows: reset the optimistic order during
  // render (the React derived-state pattern — no effect, no extra pass).
  const [order, setOrder] = useState<ListRow[]>(data.rows)
  const [prevRows, setPrevRows] = useState(data.rows)
  if (prevRows !== data.rows) {
    setPrevRows(data.rows)
    setOrder(data.rows)
  }

  // The pages group keeps its own optimistic order (separate sort space).
  const pageRows = data.pages?.rows ?? NO_ROWS
  const [pageOrder, setPageOrder] = useState<ListRow[]>(pageRows)
  const [prevPageRows, setPrevPageRows] = useState(pageRows)
  if (prevPageRows !== pageRows) {
    setPrevPageRows(pageRows)
    setPageOrder(pageRows)
  }

  const [dragFrom, setDragFrom] = useState<{ group: RowGroup; index: number } | null>(null)
  const [createOpen, setCreateOpen] = useState<RowGroup | null>(null)
  const [editRow, setEditRow] = useState<{ row: ListRow; group: RowGroup } | null>(null)
  const [moveRow, setMoveRow] = useState<{ row: ListRow; group: RowGroup } | null>(null)

  const level = data.level
  const levelName = t(`levelNames.${level}`)
  const mixed = data.pages !== undefined
  const hasSem = level === 'topic'
  const gridCols = mixed
    ? 'grid-cols-[36px_64px_1fr_110px_70px_90px_170px]'
    : hasSem
      ? 'grid-cols-[36px_1fr_110px_70px_90px_170px]'
      : 'grid-cols-[36px_1fr_110px_90px_170px]'

  const groupLevel = (group: RowGroup): ContentLevel => (group === 'pages' ? 'subtopic' : level)
  const groupOrder = (group: RowGroup) => (group === 'pages' ? pageOrder : order)
  const groupSetOrder = (group: RowGroup) => (group === 'pages' ? setPageOrder : setOrder)
  const groupReset = (group: RowGroup) => (group === 'pages' ? pageRows : data.rows)
  const groupMoveTargets = (group: RowGroup) =>
    group === 'pages' ? (data.pages?.moveTargets ?? []) : data.moveTargets

  const commitOrder = (group: RowGroup, next: ListRow[]) => {
    groupSetOrder(group)(next)
    startTransition(async () => {
      const result = await reorderNodes(
        groupLevel(group),
        data.parentId,
        next.map((row) => row.id),
      )
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        groupSetOrder(group)(groupReset(group))
        return
      }
      toast({ title: t('toasts.reordered') })
      router.refresh()
    })
  }

  const moveBy = (group: RowGroup, index: number, delta: -1 | 1) => {
    const rows = groupOrder(group)
    const target = index + delta
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item as ListRow)
    commitOrder(group, next)
  }

  // Drops only land within the source group — no cross-kind interleaving.
  const onDrop = (group: RowGroup, dropIndex: number) => {
    if (dragFrom === null || dragFrom.group !== group || dragFrom.index === dropIndex) return
    const rows = groupOrder(group)
    const next = [...rows]
    const [item] = next.splice(dragFrom.index, 1)
    next.splice(dropIndex, 0, item as ListRow)
    setDragFrom(null)
    commitOrder(group, next)
  }

  const renderRows = (group: RowGroup) => {
    const rows = groupOrder(group)
    return rows.map((row, index) => (
      <li
        key={row.id}
        draggable
        onDragStart={() => setDragFrom({ group, index })}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => onDrop(group, index)}
        className={`grid ${gridCols} items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0 ${
          dragFrom?.group === group && dragFrom.index === index ? 'bg-primary-tint/60' : ''
        }`}
      >
        <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-ink-2">
          <span aria-hidden className="cursor-grab select-none">
            ⇅
          </span>
          {index + 1}
          <span className="ms-0.5 hidden flex-col leading-none [@media(hover:hover)]:flex">
            <button
              type="button"
              aria-label={t('reorder.moveUp', { name: row.name })}
              disabled={index === 0}
              onClick={() => moveBy(group, index, -1)}
              className="text-[9px] text-ink-2 hover:text-ink disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              aria-label={t('reorder.moveDown', { name: row.name })}
              disabled={index === rows.length - 1}
              onClick={() => moveBy(group, index, 1)}
              className="text-[9px] text-ink-2 hover:text-ink disabled:opacity-30"
            >
              ▼
            </button>
          </span>
        </span>

        {mixed ? (
          <span>
            <span className="inline-block border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
              {group === 'pages' ? t('kind.page') : t('kind.topic')}
            </span>
          </span>
        ) : null}

        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">{row.name}</span>
          <span className="block truncate font-mono text-[10.5px] text-ink-2">{row.slug}</span>
        </span>

        <span>
          <StatusChip status={row.status} />
        </span>

        {hasSem || mixed ? (
          <span>
            {row.semester ? (
              <span className="inline-block border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-2">
                {row.semester}
              </span>
            ) : (
              <span className="text-[11px] text-ink-2">—</span>
            )}
          </span>
        ) : null}

        <span className="font-mono text-[11px] text-ink-2">{formatUpdated(row.updatedAt)}</span>

        <span className="flex gap-2.5 text-[12.5px]">
          <button
            type="button"
            className="text-primary underline-offset-2 hover:underline"
            onClick={() => setEditRow({ row, group })}
          >
            {t('actions.edit')}
          </button>
          {data.canManage && groupMoveTargets(group).length > 0 ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => setMoveRow({ row, group })}
            >
              {t('actions.move')}
            </button>
          ) : null}
          {row.openHref ? (
            <Link href={row.openHref} className="text-primary underline-offset-2 hover:underline">
              {t('actions.open')}
            </Link>
          ) : null}
        </span>
      </li>
    ))
  }

  const empty = order.length === 0 && pageOrder.length === 0

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="flex-1 font-display text-[19px] font-bold">{heading}</h1>
        <Button size="sm" onClick={() => setCreateOpen('primary')}>
          {t('newButton', { levelName })}
        </Button>
        {mixed ? (
          <Button size="sm" onClick={() => setCreateOpen('pages')}>
            {t('newPageButton')}
          </Button>
        ) : null}
      </div>

      {empty ? (
        <div className="border border-line bg-surface p-8 text-center">
          <MonographLabel as="div" size="sm" className="mb-2">
            {t('emptyLabel')}
          </MonographLabel>
          <p className="text-[13px] text-ink-2">{t('emptyBody', { levelName })}</p>
        </div>
      ) : (
        <div className="border border-line bg-surface">
          <div className={`grid ${gridCols} items-center gap-3 border-b border-ink px-4 py-2`}>
            <MonographLabel as="span" size="sm">
              {t('columns.ord')}
            </MonographLabel>
            {mixed ? (
              <MonographLabel as="span" size="sm">
                {t('columns.kind')}
              </MonographLabel>
            ) : null}
            <MonographLabel as="span" size="sm">
              {t('columns.nameSlug')}
            </MonographLabel>
            <MonographLabel as="span" size="sm">
              {t('columns.status')}
            </MonographLabel>
            {hasSem || mixed ? (
              <MonographLabel as="span" size="sm">
                {t('columns.sem')}
              </MonographLabel>
            ) : null}
            <MonographLabel as="span" size="sm">
              {t('columns.updated')}
            </MonographLabel>
            <MonographLabel as="span" size="sm">
              {t('columns.actions')}
            </MonographLabel>
          </div>

          <ul>
            {renderRows('primary')}
            {renderRows('pages')}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[12px] text-ink-2">{t('slugHelper')}</p>

      {createOpen !== null ? (
        <NodeSheet
          level={createOpen === 'pages' ? 'subtopic' : level}
          parentLevel={createOpen === 'pages' ? 'chapter' : undefined}
          mode="create"
          parentId={data.parentId}
          canManage={data.canManage}
          open
          onClose={() => setCreateOpen(null)}
        />
      ) : null}
      {editRow ? (
        <NodeSheet
          level={editRow.group === 'pages' ? 'subtopic' : level}
          parentLevel={editRow.group === 'pages' ? 'chapter' : undefined}
          mode="edit"
          parentId={data.parentId}
          row={editRow.row}
          canManage={data.canManage}
          open
          onClose={() => setEditRow(null)}
        />
      ) : null}
      {moveRow ? (
        <MoveSheet
          level={moveRow.group === 'pages' ? 'subtopic' : level}
          row={moveRow.row}
          targets={groupMoveTargets(moveRow.group).map((target) => ({
            ...target,
            current: target.id === data.parentId,
          }))}
          open
          onClose={() => setMoveRow(null)}
        />
      ) : null}
    </div>
  )
}
