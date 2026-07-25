'use client'

import { setAlign, setLineHeight } from '@platejs/basic-styles'
import { indent, outdent } from '@platejs/indent'
import { setColumns } from '@platejs/layout'
import {
  deleteColumn,
  deleteRow,
  deleteTable,
  getTableAbove,
  insertTableColumn,
  insertTableRow,
  mergeTableCells,
  splitTableCell,
} from '@platejs/table'
import { useTableMergeState } from '@platejs/table/react'
import type { LucideIcon } from 'lucide-react'
import {
  ALargeSmall,
  Baseline,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Columns2,
  Columns3,
  Grid2x2,
  ListIndentDecrease,
  ListIndentIncrease,
  PaintBucket,
  PanelLeft,
  PanelRight,
  TableCellsMerge,
  TableCellsSplit,
  TableColumnsSplit,
  TableRowsSplit,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  TextWrap,
  Trash2,
} from 'lucide-react'
import type { TElement } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { useEditorRef, useEditorSelector } from 'platejs/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import type { Alignment } from '../schema/types'
import type { SubtopicEditorLabels } from './labels'

/**
 * Toolbar dropdown chrome for the block-styling features (schema v2):
 * alignment, line height, font size, text/background color, indent, the
 * contextual table menu (insert/delete rows+columns, merge/split, header
 * toggles), and the contextual column-layout menu. Functional twins of the
 * official plate-ui toolbar buttons (align-toolbar-button, table dropdown,
 * font color picker…), rebuilt on our token classes — no radix/shadcn.
 */

/* ------------------------------------------------------------- primitives */

const menuButtonClass = (pressed: boolean) =>
  `flex h-8 min-w-8 items-center justify-center gap-0.5 border px-1.5 font-mono text-xs disabled:opacity-40 ${
    pressed
      ? 'border-ink bg-primary-tint text-primary'
      : 'border-transparent text-ink-2 hover:border-line'
  }`

const menuItemClass =
  'flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-start font-mono text-xs text-ink hover:bg-paper disabled:opacity-40'

export function ChromeDropdown({
  label,
  icon: Icon,
  active = false,
  children,
}: {
  label: string
  icon: LucideIcon
  /** Highlights the trigger when the feature is active on the selection. */
  active?: boolean
  children: (close: () => void) => ReactNode
}) {
  const editor = useEditorRef()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          editor.tf.focus()
        }
      }}
    >
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
        className={menuButtonClass(open || active)}
      >
        <Icon className="size-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute start-0 top-full z-30 mt-px min-w-40 border border-ink bg-surface py-1 shadow-none">
          {children(() => {
            setOpen(false)
            editor.tf.focus()
          })}
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({
  label,
  icon: Icon,
  selected = false,
  disabled = false,
  onSelect,
}: {
  label: string
  icon?: LucideIcon
  selected?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      className={`${menuItemClass} ${selected ? 'text-primary' : ''}`}
    >
      {Icon ? <Icon className="size-4 shrink-0 text-ink-2" aria-hidden /> : null}
      {label}
    </button>
  )
}

/* -------------------------------------------------------------- alignment */

const ALIGN_ITEMS: Array<{ value: Alignment; icon: LucideIcon }> = [
  { value: 'left', icon: TextAlignStart },
  { value: 'center', icon: TextAlignCenter },
  { value: 'right', icon: TextAlignEnd },
  { value: 'justify', icon: TextAlignJustify },
]

/** Official align-toolbar-button behavior: dropdown of the four lucide
 * icons; picking the current value again resets to `start` (unset). */
export function AlignMenu({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  const current = useEditorSelector((ed) => {
    const entry = ed.api.block()
    const value = entry?.[0]?.align
    return typeof value === 'string' ? value : undefined
  }, [])
  const alignLabels: Record<Alignment, string> = {
    left: labels.alignLeft,
    center: labels.alignCenter,
    right: labels.alignRight,
    justify: labels.alignJustify,
  }
  const CurrentIcon = ALIGN_ITEMS.find((item) => item.value === current)?.icon ?? TextAlignStart
  return (
    <ChromeDropdown label={labels.alignLabel} icon={CurrentIcon} active={current !== undefined}>
      {(close) => (
        <>
          {ALIGN_ITEMS.map(({ value, icon }) => (
            <MenuItem
              key={value}
              label={alignLabels[value]}
              icon={icon}
              selected={current === value}
              onSelect={() => {
                // Re-picking the active value clears back to default.
                setAlign(editor, current === value ? 'start' : value)
                close()
              }}
            />
          ))}
        </>
      )}
    </ChromeDropdown>
  )
}

/* ------------------------------------------------------------ line height */

const LINE_HEIGHTS = [1, 1.2, 2, 3]

export function LineHeightMenu({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  const current = useEditorSelector((ed) => {
    const entry = ed.api.block()
    const value = entry?.[0]?.lineHeight
    return typeof value === 'number' ? value : undefined
  }, [])
  return (
    <ChromeDropdown label={labels.lineHeightLabel} icon={TextWrap} active={current !== undefined}>
      {(close) => (
        <>
          <MenuItem
            label={labels.lineHeightDefault}
            selected={current === undefined}
            onSelect={() => {
              // The plugin's defaultNodeValue (1.5) unsets the prop.
              setLineHeight(editor, 1.5)
              close()
            }}
          />
          {LINE_HEIGHTS.map((value) => (
            <MenuItem
              key={value}
              label={String(value)}
              selected={current === value}
              onSelect={() => {
                setLineHeight(editor, value)
                close()
              }}
            />
          ))}
        </>
      )}
    </ChromeDropdown>
  )
}

/* -------------------------------------------------------------- font size */

const FONT_SIZES = ['12px', '14px', '18px', '20px', '24px', '32px']

export function FontSizeMenu({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  const current = useEditorSelector((ed) => {
    try {
      const marks = ed.api.marks() as Record<string, unknown> | null
      const value = marks?.fontSize
      return typeof value === 'string' ? value : undefined
    } catch {
      return undefined
    }
  }, [])
  return (
    <ChromeDropdown label={labels.fontSizeLabel} icon={ALargeSmall} active={current !== undefined}>
      {(close) => (
        <>
          <MenuItem
            label={labels.fontSizeDefault}
            selected={current === undefined}
            onSelect={() => {
              editor.tf.removeMarks('fontSize')
              close()
            }}
          />
          {FONT_SIZES.map((value) => (
            <MenuItem
              key={value}
              label={value}
              selected={current === value}
              onSelect={() => {
                editor.tf.addMarks({ fontSize: value })
                close()
              }}
            />
          ))}
        </>
      )}
    </ChromeDropdown>
  )
}

/* ------------------------------------------------------------ color picker */

/** Token-adjacent swatch roster (matches the official picker's compact
 * grid; values are plain CSS colors the schema validates). */
const COLOR_SWATCHES = [
  '#111827',
  '#6b7280',
  '#b91c1c',
  '#c2410c',
  '#a16207',
  '#15803d',
  '#0e7490',
  '#1d4ed8',
  '#7e22ce',
  '#be185d',
]

const BACKGROUND_SWATCHES = [
  '#fee2e2',
  '#ffedd5',
  '#fef9c3',
  '#dcfce7',
  '#cffafe',
  '#dbeafe',
  '#f3e8ff',
  '#fce7f3',
  '#f3f4f6',
  '#e5e7eb',
]

export function ColorMenu({
  labels,
  markKey,
}: {
  labels: SubtopicEditorLabels
  markKey: 'color' | 'backgroundColor'
}) {
  const editor = useEditorRef()
  const label = markKey === 'color' ? labels.textColorLabel : labels.backgroundColorLabel
  const swatches = markKey === 'color' ? COLOR_SWATCHES : BACKGROUND_SWATCHES
  const current = useEditorSelector(
    (ed) => {
      try {
        const marks = ed.api.marks() as Record<string, unknown> | null
        const value = marks?.[markKey]
        return typeof value === 'string' ? value : undefined
      } catch {
        return undefined
      }
    },
    [markKey],
  )
  const apply = (value: string, close: () => void) => {
    editor.tf.addMarks({ [markKey]: value })
    close()
  }
  return (
    <ChromeDropdown
      label={label}
      icon={markKey === 'color' ? Baseline : PaintBucket}
      active={current !== undefined}
    >
      {(close) => (
        <div className="px-2 py-1">
          <div className="grid grid-cols-5 gap-1 pb-1">
            {swatches.map((value) => (
              <button
                key={value}
                type="button"
                title={value}
                aria-label={value}
                aria-pressed={current === value}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => apply(value, close)}
                className={`size-5 border ${current === value ? 'border-ink' : 'border-line'}`}
                style={{ backgroundColor: value }}
              />
            ))}
          </div>
          <label className={`${menuItemClass} cursor-pointer px-0`}>
            <input
              type="color"
              aria-label={labels.colorCustom}
              value={
                current && current.startsWith('#') && current.length === 7 ? current : '#111827'
              }
              onChange={(event) => apply(event.target.value, () => undefined)}
              className="size-5 shrink-0 cursor-pointer border border-line bg-surface p-0"
            />
            {labels.colorCustom}
          </label>
          <MenuItem
            label={labels.colorDefault}
            onSelect={() => {
              editor.tf.removeMarks(markKey)
              close()
            }}
          />
        </div>
      )}
    </ChromeDropdown>
  )
}

/* ----------------------------------------------------------------- indent */

export function IndentButtons({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  return (
    <>
      <button
        type="button"
        title={labels.indentDecrease}
        aria-label={labels.indentDecrease}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          outdent(editor)
          editor.tf.focus()
        }}
        className={menuButtonClass(false)}
      >
        <ListIndentDecrease className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        title={labels.indentIncrease}
        aria-label={labels.indentIncrease}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          indent(editor)
          editor.tf.focus()
        }}
        className={menuButtonClass(false)}
      >
        <ListIndentIncrease className="size-4" aria-hidden />
      </button>
    </>
  )
}

/* ------------------------------------------------------------- table menu */

const toggleHeaderRow = (editor: PlateEditor) => {
  const table = getTableAbove(editor)
  if (!table) return
  const [tableNode, tablePath] = table
  const firstRow = (tableNode.children as TElement[])[0]
  if (!firstRow) return
  const cells = firstRow.children as TElement[]
  const nextType = cells.some((cell) => cell.type === 'td') ? 'th' : 'td'
  editor.tf.withoutNormalizing(() => {
    cells.forEach((_, cellIndex) => {
      editor.tf.setNodes({ type: nextType }, { at: [...tablePath, 0, cellIndex] })
    })
  })
}

const toggleHeaderColumn = (editor: PlateEditor) => {
  const table = getTableAbove(editor)
  if (!table) return
  const [tableNode, tablePath] = table
  const rows = tableNode.children as TElement[]
  const firstCells = rows
    .map((row) => (row.children as TElement[])[0])
    .filter((cell): cell is TElement => cell !== undefined)
  const nextType = firstCells.some((cell) => cell.type === 'td') ? 'th' : 'td'
  editor.tf.withoutNormalizing(() => {
    rows.forEach((_, rowIndex) => {
      editor.tf.setNodes({ type: nextType }, { at: [...tablePath, rowIndex, 0] })
    })
  })
}

/** Contextual table dropdown — official table dropdown menu features
 * (rows, columns, merge/split, headers, delete) on our chrome. Render only
 * while the selection is inside a table. */
export function TableMenu({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  const { canMerge, canSplit } = useTableMergeState()
  const run = (close: () => void, action: (editor: PlateEditor) => void) => () => {
    action(editor)
    close()
  }
  return (
    <ChromeDropdown label={labels.tableMenuLabel} icon={Grid2x2} active>
      {(close) => (
        <>
          <MenuItem
            label={labels.tableRowAdd}
            icon={BetweenHorizontalEnd}
            onSelect={run(close, (ed) => insertTableRow(ed))}
          />
          <MenuItem
            label={labels.tableRowRemove}
            icon={TableRowsSplit}
            onSelect={run(close, (ed) => deleteRow(ed))}
          />
          <MenuItem
            label={labels.tableColAdd}
            icon={BetweenVerticalEnd}
            onSelect={run(close, (ed) => insertTableColumn(ed))}
          />
          <MenuItem
            label={labels.tableColRemove}
            icon={TableColumnsSplit}
            onSelect={run(close, (ed) => deleteColumn(ed))}
          />
          <MenuItem
            label={labels.tableMergeCells}
            icon={TableCellsMerge}
            disabled={!canMerge}
            onSelect={run(close, (ed) => mergeTableCells(ed))}
          />
          <MenuItem
            label={labels.tableSplitCell}
            icon={TableCellsSplit}
            disabled={!canSplit}
            onSelect={run(close, (ed) => splitTableCell(ed))}
          />
          <MenuItem
            label={labels.tableHeaderRow}
            icon={PanelLeft}
            onSelect={run(close, toggleHeaderRow)}
          />
          <MenuItem
            label={labels.tableHeaderCol}
            icon={PanelRight}
            onSelect={run(close, toggleHeaderColumn)}
          />
          <MenuItem
            label={labels.tableDelete}
            icon={Trash2}
            onSelect={run(close, (ed) => deleteTable(ed))}
          />
        </>
      )}
    </ChromeDropdown>
  )
}

/* ----------------------------------------------------------- column menu */

const COLUMN_LAYOUTS: Array<{
  labelKey: keyof SubtopicEditorLabels
  icon: LucideIcon
  widths: string[]
}> = [
  { labelKey: 'columnLayout5050', icon: Columns2, widths: ['50%', '50%'] },
  { labelKey: 'columnLayout333', icon: Columns3, widths: ['33%', '33%', '33%'] },
  { labelKey: 'columnLayout7030', icon: PanelRight, widths: ['70%', '30%'] },
  { labelKey: 'columnLayout3070', icon: PanelLeft, widths: ['30%', '70%'] },
]

/** Contextual column-layout dropdown — the official ColumnFloatingToolbar's
 * presets, surfaced from the fixed toolbar while inside a column group. */
export function ColumnLayoutMenu({ labels }: { labels: SubtopicEditorLabels }) {
  const editor = useEditorRef()
  return (
    <ChromeDropdown label={labels.columnLayoutLabel} icon={Columns2} active>
      {(close) => (
        <>
          {COLUMN_LAYOUTS.map(({ labelKey, icon, widths }) => (
            <MenuItem
              key={labelKey}
              label={labels[labelKey]}
              icon={icon}
              onSelect={() => {
                const entry = editor.api.above<TElement>({
                  match: (node) => (node as TElement).type === 'column_group',
                })
                if (entry) setColumns(editor, { at: entry[1], widths })
                close()
              }}
            />
          ))}
        </>
      )}
    </ChromeDropdown>
  )
}
