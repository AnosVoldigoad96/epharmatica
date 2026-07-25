'use client'

import { DndPlugin, useDraggable, useDropLine } from '@platejs/dnd'
import { TogglePlugin } from '@platejs/toggle/react'
import { GripVertical } from 'lucide-react'
import type { NodeEntry, TElement } from 'platejs'
import type { PlateEditor, PlateElementProps, RenderNodeWrapper } from 'platejs/react'
import { MemoizedChildren, useEditorRef, useElement, useSelected } from 'platejs/react'
import * as React from 'react'

import { cn } from './cn'
import { useEditorLabels } from './context'

/**
 * Vendored plate-ui `block-draggable.tsx` (registry v53.3.2), adapted:
 *
 *  - TOP-LEVEL blocks only (path length 1). Nested nodes — table rows/cells,
 *    callout paragraphs, code lines — are never wrapped, so they stay
 *    non-draggable; the column/table depth-3/4 branches of the official
 *    component are dropped (no columns here, tables drag as one block).
 *  - No BlockSelectionPlugin (we don't ship it): the drag set is the hovered
 *    block expanded with its flat-list children (a parent list item drags
 *    its indented sub-items along, Notion-style, exactly like the official
 *    `expandListItemsWithChildren` path). Clicking the handle selects the
 *    block in the editor instead of block-selecting it.
 *  - shadcn Button/Tooltip → a plain button with title/aria-label; semantic
 *    classes → our tokens.
 *
 * The drag mechanics are the official ones: `handleRef` (react-dnd drag
 * source connector) on the handle button — and, critically, NO
 * `preventDefault()` on the handle's mousedown. HTML5 drag initiation is
 * part of mousedown's default action, so preventing it means `dragstart`
 * never fires — that was the bug that made dragging do nothing. The handle
 * instead blurs + collapses the editor selection on mousedown (official
 * behavior) and builds the drag preview from cloned block DOM nodes.
 */

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, path } = props

  // Read-only/preview surfaces never get handles (DndPlugin is editOnly
  // anyway; this mirrors the official guard).
  if (editor.dom.readOnly) return
  if (path.length !== 1) return

  return (elementProps) => <Draggable {...elementProps} />
}

function Draggable(props: PlateElementProps) {
  const { children, editor, element } = props

  const { isAboutToDrag, isDragging, nodeRef, previewRef, handleRef } = useDraggable({
    element,
    onDropHandler: () => {
      resetPreview()
    },
  })

  const [previewTop, setPreviewTop] = React.useState(0)
  const [dragButtonTop, setDragButtonTop] = React.useState(0)

  const resetPreview = () => {
    if (previewRef.current) {
      previewRef.current.replaceChildren()
      previewRef.current.classList.add('hidden')
    }
  }

  // Clear the cloned preview when the drag ends.
  React.useEffect(() => {
    if (!isDragging) {
      resetPreview()
    }
  }, [isDragging])

  // Reveal the preview the instant the browser is about to capture it.
  React.useEffect(() => {
    if (isAboutToDrag) {
      previewRef.current?.classList.remove('opacity-0')
    }
  }, [isAboutToDrag])

  return (
    <div
      className={cn('group/block relative', isDragging && 'opacity-50')}
      onMouseEnter={() => {
        if (isDragging) return
        setDragButtonTop(calcDragButtonTop(editor, element))
      }}
    >
      <Gutter>
        <div className="slate-blockToolbarWrapper flex h-[1.5em]">
          <div className="slate-blockToolbar pointer-events-auto relative mr-1 flex w-4.5 items-center">
            <button
              ref={handleRef}
              type="button"
              className="absolute -left-0 flex h-6 w-full items-center justify-center p-0 text-ink-2 hover:bg-paper hover:text-ink"
              style={{ top: `${dragButtonTop + 3}px` }}
            >
              <DragHandle
                isDragging={isDragging}
                previewRef={previewRef}
                resetPreview={resetPreview}
                setPreviewTop={setPreviewTop}
              />
            </button>
          </div>
        </div>
      </Gutter>

      {/* Drag preview: filled with cloned block DOM on handle mousedown. */}
      <div
        ref={previewRef}
        className="absolute -left-0 hidden w-full"
        style={{ top: `${-previewTop}px` }}
        contentEditable={false}
      />

      <div ref={nodeRef} className="slate-blockWrapper flow-root">
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLine />
      </div>
    </div>
  )
}

function Gutter({ children, className, ...props }: React.ComponentProps<'div'>) {
  const selected = useSelected()

  return (
    <div
      {...props}
      className={cn(
        'slate-gutterLeft',
        'absolute top-0 z-50 flex h-full -translate-x-full cursor-text hover:opacity-100 sm:opacity-0',
        'group-hover/block:opacity-100',
        !selected && 'opacity-0',
        className,
      )}
      contentEditable={false}
    >
      {children}
    </div>
  )
}

const DragHandle = React.memo(function DragHandle({
  isDragging,
  previewRef,
  resetPreview,
  setPreviewTop,
}: {
  isDragging: boolean
  previewRef: React.RefObject<HTMLDivElement | null>
  resetPreview: () => void
  setPreviewTop: (top: number) => void
}) {
  const editor = useEditorRef()
  const element = useElement()
  const labels = useEditorLabels()

  /**
   * The hovered block — expanded with its toggle contents. Classic lists
   * are single container blocks (one handle, whole list drags at once), so
   * the flat-model `expandListItemsWithChildren` is gone; toggles keep the
   * multi-block behavior: dragging a toggle brings every top-level block it
   * encloses (TogglePlugin's toggleIndex maps block id → enclosing toggle
   * ids), so closed contents never orphan.
   */
  const dragBlocks = (): NodeEntry<TElement>[] => {
    let selectionNodes = editor.api.blocks({ mode: 'highest' })

    // If the hovered block is not in the selection, it is the drag set.
    if (!selectionNodes.some(([node]) => node.id === element.id)) {
      const path = editor.api.findPath(element)
      if (!path) return []
      selectionNodes = [[element, path]]
    }

    const toggleIds = new Set(
      selectionNodes.filter(([node]) => node.type === 'toggle').map(([node]) => node.id as string),
    )
    if (toggleIds.size === 0) return selectionNodes

    const toggleIndex = editor.getOption(TogglePlugin, 'toggleIndex')
    const seen = new Set(selectionNodes.map(([node]) => node.id as string))
    const expanded = [...selectionNodes]
    ;(editor.children as TElement[]).forEach((node, index) => {
      const id = node.id as string
      if (seen.has(id)) return
      const enclosing: string[] = toggleIndex?.get(id) ?? []
      if (enclosing.some((toggleId) => toggleIds.has(toggleId))) {
        seen.add(id)
        expanded.push([node, [index]])
      }
    })
    // Keep document order so the preview stack matches the drag set.
    expanded.sort((a, b) => (a[1][0] as number) - (b[1][0] as number))
    return expanded
  }

  return (
    <div
      className="flex size-full cursor-grab items-center justify-center active:cursor-grabbing"
      aria-label={labels.dragHandleLabel}
      title={labels.dragHandleLabel}
      onClick={(e) => {
        e.preventDefault()
        const path = editor.api.findPath(element)
        if (path) editor.tf.select(path)
        editor.tf.focus()
      }}
      onMouseDown={(e) => {
        // NO preventDefault here: HTML5 drag initiation is part of
        // mousedown's default action — preventing it kills dragstart.
        resetPreview()

        if ((e.button !== 0 && e.button !== 2) || e.shiftKey) return

        const blocks = dragBlocks().map(([node]) => node)
        if (blocks.length === 0) return

        editor.tf.blur()
        editor.tf.collapse()

        const elements = createDragPreviewElements(editor, blocks)
        previewRef.current?.append(...elements)
        previewRef.current?.classList.remove('hidden')
        previewRef.current?.classList.add('opacity-0')
        editor.setOption(DndPlugin, 'multiplePreviewRef', previewRef)
      }}
      onMouseEnter={() => {
        if (isDragging) return

        const blocks = dragBlocks().map(([node]) => node)
        const ids = blocks.map((block) => block.id as string)

        if (ids.length > 1 && ids.includes(element.id as string)) {
          setPreviewTop(calculatePreviewTop(editor, { blocks, element }))
        } else {
          setPreviewTop(0)
        }
      }}
      onMouseUp={() => {
        resetPreview()
      }}
      role="button"
    >
      <GripVertical className="size-4 text-ink-2" />
    </div>
  )
})

const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const { dropLine } = useDropLine()

  if (!dropLine) return null

  return (
    <div
      {...props}
      className={cn(
        'slate-dropLine',
        'absolute inset-x-0 h-0.5 opacity-100 transition-opacity',
        'bg-primary/50',
        dropLine === 'top' && '-top-px',
        dropLine === 'bottom' && '-bottom-px',
        className,
      )}
    />
  )
})

/**
 * Clone the dragged blocks' DOM into the preview container (official
 * implementation) and record the dragged ids on the DndPlugin so a
 * multi-block drag (list item + children) moves the whole set.
 */
const createDragPreviewElements = (editor: PlateEditor, blocks: TElement[]): HTMLElement[] => {
  const elements: HTMLElement[] = []
  const ids: string[] = []

  /**
   * Remove data attributes from the element to avoid recognized as slate
   * elements incorrectly.
   */
  const removeDataAttributes = (element: HTMLElement) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith('data-slate') || attr.name.startsWith('data-block-id')) {
        element.removeAttribute(attr.name)
      }
    })

    Array.from(element.children).forEach((child) => {
      removeDataAttributes(child as HTMLElement)
    })
  }

  const resolveElement = (node: TElement, index: number) => {
    const domNode = editor.api.toDOMNode(node)
    if (!domNode) return
    const newDomNode = domNode.cloneNode(true) as HTMLElement

    // Apply visual compensation for horizontal scroll
    const applyScrollCompensation = (original: Element, cloned: HTMLElement) => {
      const scrollLeft = original.scrollLeft

      if (scrollLeft > 0) {
        // Create a wrapper to handle the scroll offset
        const scrollWrapper = document.createElement('div')
        scrollWrapper.style.overflow = 'hidden'
        scrollWrapper.style.width = `${original.clientWidth}px`

        // Create inner container with the full content
        const innerContainer = document.createElement('div')
        innerContainer.style.transform = `translateX(-${scrollLeft}px)`
        innerContainer.style.width = `${original.scrollWidth}px`

        // Move all children to the inner container
        while (cloned.firstChild) {
          innerContainer.append(cloned.firstChild)
        }

        // Apply the original element's styles to maintain appearance
        const originalStyles = window.getComputedStyle(original)
        cloned.style.padding = '0'
        innerContainer.style.padding = originalStyles.padding

        scrollWrapper.append(innerContainer)
        cloned.append(scrollWrapper)
      }
    }

    applyScrollCompensation(domNode, newDomNode)

    ids.push(node.id as string)
    const wrapper = document.createElement('div')
    wrapper.append(newDomNode)
    wrapper.style.display = 'flow-root'

    const lastDomNode = blocks[index - 1]

    if (lastDomNode) {
      const lastDomNodeRect = editor.api
        .toDOMNode(lastDomNode)
        ?.parentElement?.getBoundingClientRect()

      const domNodeRect = domNode.parentElement?.getBoundingClientRect()

      if (lastDomNodeRect && domNodeRect) {
        const distance = domNodeRect.top - lastDomNodeRect.bottom

        // Check if the two elements are adjacent (touching each other)
        if (distance > 15) {
          wrapper.style.marginTop = `${distance}px`
        }
      }
    }

    removeDataAttributes(newDomNode)
    elements.push(wrapper)
  }

  blocks.forEach((node, index) => {
    resolveElement(node, index)
  })

  editor.setOption(DndPlugin, 'draggingId', ids)

  return elements
}

/** Offset of the preview stack when the hovered block is not the first dragged block. */
const calculatePreviewTop = (
  editor: PlateEditor,
  { blocks, element }: { blocks: TElement[]; element: TElement },
): number => {
  const child = editor.api.toDOMNode(element)
  const editable = editor.api.toDOMNode(editor)
  const firstSelectedChild = blocks[0]
  const firstDomNode = firstSelectedChild ? editor.api.toDOMNode(firstSelectedChild) : undefined
  if (!child || !editable || !firstDomNode) return 0

  // Get editor's top padding
  const editorPaddingTop = Number(window.getComputedStyle(editable).paddingTop.replace('px', ''))

  // Calculate distance from first selected node to editor top
  const firstNodeToEditorDistance =
    firstDomNode.getBoundingClientRect().top -
    editable.getBoundingClientRect().top -
    editorPaddingTop

  // Get margin top of first selected node
  const firstMarginTopString = window.getComputedStyle(firstDomNode).marginTop
  const marginTop = Number(firstMarginTopString.replace('px', ''))

  // Calculate distance from current node to editor top
  const currentToEditorDistance =
    child.getBoundingClientRect().top - editable.getBoundingClientRect().top - editorPaddingTop

  const currentMarginTopString = window.getComputedStyle(child).marginTop
  const currentMarginTop = Number(currentMarginTopString.replace('px', ''))

  return currentToEditorDistance - firstNodeToEditorDistance + marginTop - currentMarginTop
}

/** Align the handle with the block's first text line despite block margins. */
const calcDragButtonTop = (editor: PlateEditor, element: TElement): number => {
  const child = editor.api.toDOMNode(element)
  if (!child) return 0

  const currentMarginTopString = window.getComputedStyle(child).marginTop

  return Number(currentMarginTopString.replace('px', ''))
}
