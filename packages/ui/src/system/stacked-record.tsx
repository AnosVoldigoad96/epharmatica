import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { MonographLabel } from './monograph-label'

/**
 * StackedRecord — the monograph made literal (STYLE.md §11, §6.6).
 * 1px-framed block with hard ink rules top + bottom, hairlines between rows;
 * mono label (sm MonographLabel, 112px inline column) at start, value in the
 * remaining column (canvas `.record`). Semantic <dl>. Server-compatible.
 */
export type StackedRecordRow = {
  label: string
  value: ReactNode
}

export type StackedRecordProps = {
  rows: ReadonlyArray<StackedRecordRow>
  className?: string
}

export function StackedRecord({ rows, className }: StackedRecordProps) {
  return (
    <dl className={cx('border-y border-ink bg-surface', className)}>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[112px_1fr] border-b border-line last:border-b-0">
          <dt className="border-e border-line px-3 py-2.25">
            <MonographLabel as="span" size="sm">
              {row.label}
            </MonographLabel>
          </dt>
          <dd className="px-3 py-2 text-[13.5px]">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
