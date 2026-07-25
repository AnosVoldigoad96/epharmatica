'use client'

import { useEquationElement, useEquationInput } from '@platejs/math/react'
import { CornerDownLeft, Radical } from 'lucide-react'
import type { TEquationElement } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement, useEditorSelector, useReadOnly, useSelected } from 'platejs/react'
import type { KatexOptions } from 'katex'
import { useEffect, useRef, useState } from 'react'

import { useEditorLabels } from './context'

/**
 * Vendored plate-ui `equation-node.tsx` (registry v53), adapted to our
 * conventions (invariant I4 keeps @platejs/math inside this package):
 *
 *  - radix Popover → the DateElement pattern: an absolutely positioned
 *    panel under the void, token classes, 0px radius;
 *  - shadcn Button + TextareaAutosize → plain chrome button + fixed-row
 *    textarea driven by the official `useEquationInput` hook (Enter
 *    submits, Escape dismisses/restores, ArrowLeft/Right at the edges walk
 *    out of an inline equation);
 *  - no BlockSelectionPlugin (we don't ship it): closing a block popover
 *    refocuses the editor instead of block-selecting;
 *  - `useEquationElement` renders the LIVE KaTeX preview client-side —
 *    fine here, this file lives in the lazy admin editor chunk. The
 *    public reader renders equations server-side (equation-static.tsx).
 *
 * Popover-open behavior is the official one: a block equation opens when
 * inserted selected or clicked; an inline equation opens whenever the
 * collapsed selection enters it.
 */

/** Official editor-preview options (equation-node.tsx registry defaults). */
const KATEX_PREVIEW_OPTIONS: KatexOptions = {
  displayMode: true,
  errorColor: '#cc0000',
  fleqn: false,
  leqno: false,
  macros: { '\\f': '#1f(#2)' },
  output: 'htmlAndMathml',
  strict: 'warn',
  throwOnError: false,
  trust: false,
}

const doneButtonClass =
  'flex h-7 select-none items-center gap-1 border border-ink bg-surface px-2 font-mono text-[11px] uppercase text-ink hover:bg-paper'

function EquationInputPanel({
  isInline,
  open,
  placeholder,
  onClose,
}: {
  isInline: boolean
  open: boolean
  placeholder: string
  onClose: () => void
}) {
  const labels = useEditorLabels()
  const {
    props: inputProps,
    ref,
    onSubmit,
  } = useEquationInput({
    isInline,
    open,
    onClose,
  })
  return (
    <div
      contentEditable={false}
      className="absolute start-0 top-full z-30 mt-px flex items-start gap-1 border border-ink bg-surface p-1.5"
    >
      <textarea
        ref={ref}
        rows={isInline ? 1 : 3}
        aria-label={labels.equationInputLabel}
        placeholder={placeholder}
        className="w-64 resize-none border border-line bg-paper px-2 py-1 font-mono text-xs text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none"
        {...inputProps}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onSubmit}
        className={doneButtonClass}
      >
        {labels.equationDone}
        <CornerDownLeft className="size-3" aria-hidden />
      </button>
    </div>
  )
}

export function EquationElement(props: PlateElementProps<TEquationElement>) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const selected = useSelected()
  const readOnly = useReadOnly()
  const [open, setOpen] = useState(selected)
  const katexRef = useRef<HTMLDivElement | null>(null)

  useEquationElement({ element, katexRef, options: KATEX_PREVIEW_OPTIONS })

  const onClose = () => {
    setOpen(false)
    editor.tf.focus()
  }

  return (
    <PlateElement {...props} className="relative my-2">
      <div contentEditable={false}>
        <div
          role="button"
          tabIndex={-1}
          onClick={() => {
            if (!readOnly) setOpen((current) => !current)
          }}
          className={`flex cursor-pointer select-none items-center justify-center px-2 py-1 hover:bg-paper ${
            selected ? 'bg-primary-tint' : ''
          }`}
        >
          {element.texExpression.length > 0 ? (
            <span ref={katexRef} className="overflow-x-auto" />
          ) : (
            <span className="flex h-7 items-center gap-2 whitespace-nowrap text-sm text-ink-2">
              <Radical className="size-4" aria-hidden />
              {labels.equationEmpty}
            </span>
          )}
        </div>
        {open && !readOnly ? (
          <EquationInputPanel
            isInline={false}
            open={open}
            placeholder={labels.equationPlaceholder}
            onClose={onClose}
          />
        ) : null}
      </div>
      {props.children}
    </PlateElement>
  )
}

export function InlineEquationElement(props: PlateElementProps<TEquationElement>) {
  const labels = useEditorLabels()
  const { editor, element } = props
  const selected = useSelected()
  const readOnly = useReadOnly()
  const isCollapsed = useEditorSelector((ed) => ed.api.isCollapsed(), [])
  const [open, setOpen] = useState(selected && isCollapsed)
  const katexRef = useRef<HTMLDivElement | null>(null)

  // Official behavior: entering the void with a collapsed selection opens
  // the TeX popover.
  useEffect(() => {
    if (selected && isCollapsed) setOpen(true)
  }, [selected, isCollapsed])

  useEquationElement({ element, katexRef, options: KATEX_PREVIEW_OPTIONS })

  const onClose = () => {
    setOpen(false)
    editor.tf.select(element, { focus: true, next: true })
  }

  return (
    <PlateElement {...props} as="span" className="relative inline-block">
      <span
        contentEditable={false}
        className={`inline-block select-none px-0.5 [&_.katex-display]:my-0 ${
          selected || open ? 'bg-primary-tint' : ''
        }`}
      >
        <span
          ref={katexRef}
          className={element.texExpression.length === 0 ? 'hidden' : 'leading-none'}
        />
        {element.texExpression.length === 0 ? (
          <span className="whitespace-nowrap text-ink-2">
            <Radical className="me-1 inline-block size-3.5 align-text-bottom" aria-hidden />
            {labels.equationEmptyInline}
          </span>
        ) : null}
      </span>
      {open && !readOnly ? (
        <EquationInputPanel
          isInline
          open={open}
          placeholder={labels.equationInlinePlaceholder}
          onClose={onClose}
        />
      ) : null}
      {props.children}
    </PlateElement>
  )
}
