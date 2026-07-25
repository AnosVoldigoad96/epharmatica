'use client'

import type { TComboboxInputElement } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'
import { useMemo } from 'react'

import { useEditorBridges, useEditorLabels } from './context'
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox'
import { buildInsertItems, insertItemGroups } from './insert-items'

/**
 * The "/" slash-command menu — the official plate-ui SlashInputElement
 * (registry slash-node.tsx) over OUR single insert roster (insert-items.ts).
 * The SlashPlugin swaps a typed "/" for this inline-void element; the
 * InlineCombobox renders a caret-anchored popover of grouped, icon-prefixed
 * items. Typing filters (label + keywords + group), arrows navigate with
 * wrap-around, Enter/click inserts, Escape/blur restores the typed "/query",
 * Backspace at the start removes the "/". Selection still goes through each
 * item's `run` — insertBlockNode keeps the empty-paragraph-replacement
 * behavior, so the storage schema never sees a difference.
 */
export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props
  const labels = useEditorLabels()
  const bridges = useEditorBridges()

  const items = useMemo(() => buildInsertItems(labels, bridges), [labels, bridges])
  const groups = useMemo(
    () =>
      insertItemGroups(labels)
        .map((group) => ({ ...group, items: items.filter((item) => item.group === group.group) }))
        .filter((group) => group.items.length > 0),
    [items, labels],
  )

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput aria-label={labels.slashInputLabel} />

        <InlineComboboxContent aria-label={labels.slashMenuLabel}>
          <InlineComboboxEmpty>{labels.slashNoResults}</InlineComboboxEmpty>

          {groups.map((group) => (
            <InlineComboboxGroup key={group.group}>
              <InlineComboboxGroupLabel>{group.label}</InlineComboboxGroupLabel>

              {group.items.map((item) => (
                <InlineComboboxItem
                  key={item.key}
                  value={item.key}
                  onClick={() => item.run(editor)}
                  label={item.label}
                  focusEditor={item.focusEditor ?? true}
                  group={group.label}
                  keywords={item.keywords}
                  disabled={item.disabled}
                  title={item.disabledNote ?? item.label}
                >
                  <div className="mr-2 text-ink-2">
                    <item.icon />
                  </div>
                  {item.label}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  )
}
