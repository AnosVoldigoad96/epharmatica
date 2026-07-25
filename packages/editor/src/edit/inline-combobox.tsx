'use client'

import * as React from 'react'

import {
  type ComboboxItemProps,
  Combobox,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxItem,
  ComboboxPopover,
  ComboboxProvider,
  ComboboxRow,
  Portal,
  useComboboxContext,
  useComboboxStore,
} from '@ariakit/react'
import { filterWords } from '@platejs/combobox'
import {
  type UseComboboxInputResult,
  useComboboxInput,
  useHTMLInputCursorState,
} from '@platejs/combobox/react'
import type { PointRef, TElement } from 'platejs'
import { useComposedRef, useEditorRef } from 'platejs/react'

import { cn } from './cn'

/**
 * Vendored plate-ui `inline-combobox.tsx` (registry v53.3.2), adapted to our
 * design tokens (invariant I4 keeps it inside this package):
 *
 *  - shadcn semantic classes → token classes (bg-popover→bg-surface,
 *    text-muted-foreground→text-ink-2, accent→primary-tint/primary), radii
 *    dropped (0px-radius design system), shadow→border border-ink;
 *  - `cva` → a plain class helper; `cn` → the local minimal joiner;
 *  - the Yjs `isCreator` gate is dropped (no collaboration here — the input
 *    always autofocuses, which is what `isCreator` resolves to without Yjs).
 *
 * Everything else — ariakit combobox store, caret-anchored popover portal,
 * cancel-on-escape/blur re-inserting "/query", arrow-key wrap-around — is
 * the official component verbatim.
 */

type FilterFn = (
  item: { value: string; group?: string; keywords?: string[]; label?: string },
  search: string,
) => boolean

type InlineComboboxContextValue = {
  filter: FilterFn | false
  inputProps: UseComboboxInputResult['props']
  inputRef: React.RefObject<HTMLInputElement | null>
  removeInput: UseComboboxInputResult['removeInput']
  showTrigger: boolean
  trigger: string
  setHasEmpty: (hasEmpty: boolean) => void
}

const InlineComboboxContext = React.createContext<InlineComboboxContextValue>(
  null as unknown as InlineComboboxContextValue,
)

const defaultFilter: FilterFn = ({ group, keywords = [], label, value }, search) => {
  const uniqueTerms = new Set([value, ...keywords, group, label].filter(Boolean))

  return Array.from(uniqueTerms).some((keyword) => keyword && filterWords(keyword, search))
}

type InlineComboboxProps = {
  children: React.ReactNode
  element: TElement
  trigger: string
  filter?: FilterFn | false
  hideWhenNoValue?: boolean
  showTrigger?: boolean
  value?: string
  setValue?: (value: string) => void
}

const InlineCombobox = ({
  children,
  element,
  filter = defaultFilter,
  hideWhenNoValue = false,
  setValue: setValueProp,
  showTrigger = true,
  trigger,
  value: valueProp,
}: InlineComboboxProps) => {
  const editor = useEditorRef()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const cursorState = useHTMLInputCursorState(inputRef)

  const [valueState, setValueState] = React.useState('')
  const hasValueProp = valueProp !== undefined
  const value = hasValueProp ? valueProp : valueState

  const setValue = React.useCallback(
    (newValue: string) => {
      setValueProp?.(newValue)

      if (!hasValueProp) {
        setValueState(newValue)
      }
    },
    [setValueProp, hasValueProp],
  )

  /**
   * Track the point just before the input element so we know where to
   * insertText if the combobox closes due to a selection change.
   */
  const insertPointRef = React.useRef<PointRef | null>(null)

  React.useEffect(() => {
    insertPointRef.current?.unref()
    insertPointRef.current = null

    const path = editor.api.findPath(element)

    if (!path) return

    const point = editor.api.before(path)

    if (!point) return

    const pointRef = editor.api.pointRef(point)
    insertPointRef.current = pointRef

    return () => {
      if (insertPointRef.current === pointRef) {
        insertPointRef.current = null
      }
      pointRef.unref()
    }
  }, [editor, element])

  const { props: inputProps, removeInput } = useComboboxInput({
    cancelInputOnBlur: true,
    cursorState,
    ref: inputRef,
    onCancelInput: (cause) => {
      if (cause !== 'backspace') {
        editor.tf.insertText(trigger + value, {
          at: insertPointRef.current?.current ?? undefined,
        })
      }
      if (cause === 'arrowLeft' || cause === 'arrowRight') {
        editor.tf.move({
          distance: 1,
          reverse: cause === 'arrowLeft',
        })
      }
    },
  })

  const [hasEmpty, setHasEmpty] = React.useState(false)

  const contextValue: InlineComboboxContextValue = React.useMemo(
    () => ({
      filter,
      inputProps,
      inputRef,
      removeInput,
      setHasEmpty,
      showTrigger,
      trigger,
    }),
    [trigger, showTrigger, filter, inputRef, inputProps, removeInput, setHasEmpty],
  )

  const store = useComboboxStore({
    setValue: (newValue) => React.startTransition(() => setValue(newValue)),
  })

  const items = store.useState('items')

  /**
   * If there is no active ID and the list of items changes, select the first
   * item.
   */
  React.useEffect(() => {
    if (!store.getState().activeId) {
      store.setActiveId(store.first())
    }
  }, [items, store])

  return (
    <span contentEditable={false}>
      <ComboboxProvider
        open={(items.length > 0 || hasEmpty) && (!hideWhenNoValue || value.length > 0)}
        store={store}
      >
        <InlineComboboxContext.Provider value={contextValue}>
          {children}
        </InlineComboboxContext.Provider>
      </ComboboxProvider>
    </span>
  )
}

const InlineComboboxInput = ({
  className,
  ref: propRef,
  ...props
}: React.HTMLAttributes<HTMLInputElement> & {
  ref?: React.RefObject<HTMLInputElement | null>
}) => {
  const {
    inputProps,
    inputRef: contextRef,
    showTrigger,
    trigger,
  } = React.useContext(InlineComboboxContext)

  const store = useComboboxContext()!
  const value = store.useState('value')

  const ref = useComposedRef(propRef, contextRef)

  /**
   * To create an auto-resizing input, we render a visually hidden span
   * containing the input value and position the input element on top of it.
   * This works well for all cases except when input exceeds the width of the
   * container.
   */

  return (
    <>
      {showTrigger && trigger}

      <span className="relative min-h-[1lh]">
        <span className="invisible overflow-hidden text-nowrap" aria-hidden="true">
          {value || '​'}
        </span>

        <Combobox
          ref={ref}
          className={cn('absolute top-0 left-0 size-full bg-transparent outline-none', className)}
          value={value}
          autoSelect
          {...inputProps}
          {...props}
        />
      </span>
    </>
  )
}

InlineComboboxInput.displayName = 'InlineComboboxInput'

const InlineComboboxContent: typeof ComboboxPopover = ({ className, ...props }) => {
  // Portal prevents CSS from leaking into popover
  const store = useComboboxContext()

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!store) return

    const state = store.getState()
    const { items, activeId } = state

    if (!items.length) return

    const currentIndex = items.findIndex((item) => item.id === activeId)

    if (event.key === 'ArrowUp' && currentIndex <= 0) {
      event.preventDefault()
      store.setActiveId(store.last())
    } else if (event.key === 'ArrowDown' && currentIndex >= items.length - 1) {
      event.preventDefault()
      store.setActiveId(store.first())
    }
  }

  return (
    <Portal>
      <ComboboxPopover
        className={cn(
          'z-50 max-h-[288px] w-[300px] overflow-y-auto border border-ink bg-surface shadow-none',
          className,
        )}
        onKeyDownCapture={handleKeyDown}
        {...props}
      />
    </Portal>
  )
}

const comboboxItemClass = (interactive: boolean) =>
  cn(
    'relative mx-1 flex h-[28px] items-center px-2 text-sm text-ink outline-none select-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    interactive &&
      'cursor-pointer transition-colors hover:bg-primary-tint hover:text-primary data-[active-item=true]:bg-primary-tint data-[active-item=true]:text-primary aria-disabled:cursor-default aria-disabled:opacity-40',
  )

const InlineComboboxItem = ({
  className,
  focusEditor = true,
  group: _group,
  keywords: _keywords,
  label: _label,
  onClick,
  ...props
}: {
  focusEditor?: boolean
  group?: string
  keywords?: string[]
  label?: string
} & ComboboxItemProps &
  Required<Pick<ComboboxItemProps, 'value'>>) => {
  const { value } = props

  const { filter, removeInput } = React.useContext(InlineComboboxContext)

  const store = useComboboxContext()!

  // Optimization: Do not subscribe to value if filter is false
  const search = filter && store.useState('value')

  const visible = React.useMemo(
    () =>
      !filter ||
      filter({ group: _group, keywords: _keywords, label: _label, value }, search as string),
    [filter, _group, _keywords, _label, value, search],
  )

  if (!visible) return null

  return (
    <ComboboxItem
      className={cn(comboboxItemClass(true), className)}
      onClick={(event) => {
        removeInput(focusEditor)
        onClick?.(event)
      }}
      {...props}
    />
  )
}

const InlineComboboxEmpty = ({ children, className }: React.HTMLAttributes<HTMLDivElement>) => {
  const { setHasEmpty } = React.useContext(InlineComboboxContext)
  const store = useComboboxContext()!
  const items = store.useState('items')

  React.useEffect(() => {
    setHasEmpty(true)

    return () => {
      setHasEmpty(false)
    }
  }, [setHasEmpty])

  if (items.length > 0) return null

  return <div className={cn(comboboxItemClass(false), 'text-ink-2', className)}>{children}</div>
}

const InlineComboboxRow = ComboboxRow

function InlineComboboxGroup({ className, ...props }: React.ComponentProps<typeof ComboboxGroup>) {
  return (
    <ComboboxGroup
      {...props}
      className={cn(
        'hidden py-1.5 not-last:border-b not-last:border-line [&:has([role=option])]:block',
        className,
      )}
    />
  )
}

function InlineComboboxGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof ComboboxGroupLabel>) {
  return (
    <ComboboxGroupLabel
      {...props}
      className={cn('mt-1.5 mb-2 px-3 text-xs font-medium text-ink-2', className)}
    />
  )
}

export {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
  InlineComboboxRow,
}
