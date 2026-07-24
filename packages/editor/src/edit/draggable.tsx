'use client'

import { useDraggable, useDropLine } from '@platejs/dnd'
import type { PlateElementProps, RenderNodeWrapper } from 'platejs/react'

import { useEditorLabels } from './context'

/**
 * Notion-style drag & reorder for TOP-LEVEL blocks only. The DndPlugin
 * registers `BlockDraggable` as an aboveNodes wrapper; it wraps blocks at
 * path length 1 (never table rows/cells, callout paragraphs, code lines —
 * they simply are not wrapped, so they are not draggable) with:
 *
 *  - a six-dot handle absolutely positioned in the reserved start gutter
 *    (the editing surface pads inline-start, so hover never shifts layout);
 *  - a drop-line indicator above/below the hovered block while dragging.
 *
 * NodeIdPlugin keeps block ids stable, so a drop is a pure move — anchors
 * survive reordering.
 */

export const BlockDraggable: RenderNodeWrapper = (props) => {
  if (props.path.length !== 1) return
  return (elementProps) => <DraggableBlock {...elementProps} />
}

function DropLine() {
  const { dropLine } = useDropLine()
  if (dropLine !== 'top' && dropLine !== 'bottom') return null
  return (
    <div
      contentEditable={false}
      className={`pointer-events-none absolute end-0 start-0 z-10 h-0.5 bg-primary ${
        dropLine === 'top' ? '-top-px' : '-bottom-px'
      }`}
    />
  )
}

function DraggableBlock(props: PlateElementProps) {
  const { editor, element, children } = props
  const labels = useEditorLabels()
  const { isDragging, previewRef, handleRef, nodeRef } = useDraggable({ element })

  return (
    <div ref={nodeRef} className="group/block relative">
      <div
        contentEditable={false}
        className="absolute -start-7 top-0.5 z-10 flex w-7 justify-start opacity-0 transition-opacity duration-75 focus-within:opacity-100 group-hover/block:opacity-100"
      >
        <button
          ref={handleRef}
          type="button"
          data-block-id={typeof element.id === 'string' ? element.id : undefined}
          aria-label={labels.dragHandleLabel}
          title={labels.dragHandleLabel}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const path = editor.api.findPath(element)
            if (path) editor.tf.select(path)
            editor.tf.focus()
          }}
          className="flex h-5 w-4 cursor-grab items-center justify-center border border-transparent font-mono text-xs leading-none text-ink-2 hover:border-line hover:text-ink active:cursor-grabbing"
        >
          ⠿
        </button>
      </div>
      <div ref={previewRef} className={isDragging ? 'opacity-40' : undefined}>
        {children}
        <DropLine />
      </div>
    </div>
  )
}
