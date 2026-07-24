'use client'

import { filterWords } from '@platejs/combobox'
import { useComboboxInput, useHTMLInputCursorState } from '@platejs/combobox/react'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useEditorBridges, useEditorLabels } from './context'
import type { InsertItem } from './insert-items'
import { buildInsertItems, insertItemGroups } from './insert-items'

/**
 * The "/" slash-command combobox (Notion-style). The SlashPlugin swaps a
 * typed "/" for an inline-void `slash_input` element; this component renders
 * that element as a caret-anchored filterable menu over the shared insert
 * roster (insert-items.ts). Enter/click inserts, Escape restores the typed
 * text, Backspace at the start removes the "/".
 */

const groupHeadingClass =
  'select-none px-3 pb-0.5 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-2'

export function SlashInputElement(props: PlateElementProps) {
  const { editor } = props
  const labels = useEditorLabels()
  const bridges = useEditorBridges()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  // Set the instant an item is chosen: blocks the cancel path from
  // re-inserting "/query" text after a successful insert.
  const selectedRef = useRef(false)

  const cursorState = useHTMLInputCursorState(inputRef)
  const { props: inputProps, removeInput } = useComboboxInput({
    ref: inputRef,
    cursorState,
    cancelInputOnBlur: false,
    onCancelInput: (cause) => {
      if (selectedRef.current || cause === 'backspace') return
      editor.tf.insertText(`/${value}`)
    },
  })

  const items = useMemo(() => buildInsertItems(labels, bridges), [labels, bridges])
  const filtered = useMemo(
    () => (value === '' ? items : items.filter((item) => filterWords(item.label, value))),
    [items, value],
  )
  const enabled = useMemo(() => filtered.filter((item) => !item.disabled), [filtered])
  const active = enabled[Math.min(activeIndex, Math.max(enabled.length - 1, 0))]

  const listRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!active || !listRef.current) return
    listRef.current
      .querySelector(`[data-slash-key="${active.key}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const select = (item: InsertItem) => {
    if (item.disabled) return
    selectedRef.current = true
    removeInput(true)
    item.run(editor)
  }

  const groups = insertItemGroups(labels)
    .map((group) => ({
      ...group,
      items: filtered.filter((item) => item.group === group.group),
    }))
    .filter((group) => group.items.length > 0)

  return (
    <PlateElement {...props} as="span" className="relative inline-block">
      <span contentEditable={false} className="font-mono text-sm text-primary">
        /
        <input
          ref={inputRef}
          aria-label={labels.slashInputLabel}
          role="combobox"
          aria-expanded={filtered.length > 0}
          aria-controls="epharm-slash-listbox"
          aria-activedescendant={active ? `epharm-slash-${active.key}` : undefined}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            inputProps.onKeyDown(event)
            if (event.defaultPrevented) return
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              if (enabled.length === 0) return
              const delta = event.key === 'ArrowDown' ? 1 : -1
              setActiveIndex((index) => (index + delta + enabled.length) % enabled.length)
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              if (active) select(active)
            }
          }}
          onBlur={inputProps.onBlur}
          className="w-24 border-none bg-transparent p-0 font-mono text-sm text-ink outline-none"
          style={{ inlineSize: `${Math.max(value.length, 1)}ch` }}
        />
      </span>
      <div
        id="epharm-slash-listbox"
        ref={listRef}
        contentEditable={false}
        role="listbox"
        aria-label={labels.slashMenuLabel}
        className="absolute start-0 top-full z-30 max-h-80 min-w-56 overflow-y-auto border border-ink bg-surface py-1 shadow-none"
      >
        {groups.length === 0 ? (
          <p className="select-none px-3 py-1.5 font-mono text-xs text-ink-2">
            {labels.slashNoResults}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.group}>
              <p className={groupHeadingClass}>{group.label}</p>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  id={`epharm-slash-${item.key}`}
                  data-slash-key={item.key}
                  type="button"
                  role="option"
                  aria-selected={active?.key === item.key}
                  disabled={item.disabled}
                  title={item.disabledNote ?? item.label}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => {
                    const index = enabled.findIndex((entry) => entry.key === item.key)
                    if (index >= 0) setActiveIndex(index)
                  }}
                  onClick={() => select(item)}
                  className={`block w-full whitespace-nowrap px-3 py-1.5 text-start font-mono text-xs disabled:opacity-40 ${
                    active?.key === item.key ? 'bg-primary-tint text-primary' : 'text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))
        )}
      </div>
      {props.children}
    </PlateElement>
  )
}
