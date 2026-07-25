'use client'

import { EmojiInlineIndexSearch, insertEmoji } from '@platejs/emoji'
import { EmojiPlugin } from '@platejs/emoji/react'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement, usePluginOption } from 'platejs/react'
import { useEffect, useMemo, useState } from 'react'

import { useEditorLabels } from './context'
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
} from './inline-combobox'

/**
 * The ':' emoji combobox — the official plate-ui EmojiInputElement
 * (registry emoji-node.tsx) over our vendored InlineCombobox, adapted to
 * the token classes. The EmojiPlugin swaps a typed ':' for this inline-void
 * element; picking an emoji inserts PLAIN unicode text (createEmojiNode
 * default), so storage never sees a new node type. The `use-debounce` hook
 * dependency is replaced with a local 100ms debounce.
 */

const TRAILING_COLON_REGEX = /:$/

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export function EmojiInputElement(props: PlateElementProps) {
  const { children, editor, element } = props
  const labels = useEditorLabels()
  const data = usePluginOption(EmojiPlugin, 'data')
  const [value, setValue] = useState('')
  const debouncedValue = useDebouncedValue(value, 100)
  const isPending = value !== debouncedValue

  const filteredEmojis = useMemo(() => {
    if (!data || debouncedValue.trim().length === 0) return []
    return EmojiInlineIndexSearch.getInstance(data)
      .search(debouncedValue.replace(TRAILING_COLON_REGEX, ''))
      .get()
  }, [data, debouncedValue])

  return (
    <PlateElement as="span" {...props}>
      <InlineCombobox
        value={value}
        element={element}
        filter={false}
        setValue={setValue}
        trigger=":"
        hideWhenNoValue
      >
        <InlineComboboxInput aria-label={labels.emojiInputLabel} />

        <InlineComboboxContent aria-label={labels.emojiMenuLabel}>
          {!isPending && <InlineComboboxEmpty>{labels.slashNoResults}</InlineComboboxEmpty>}

          <InlineComboboxGroup>
            {filteredEmojis.map((emoji) => (
              <InlineComboboxItem
                key={emoji.id}
                value={emoji.name}
                onClick={() => insertEmoji(editor, emoji)}
              >
                {emoji.skins[0]?.native} {emoji.name}
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  )
}
