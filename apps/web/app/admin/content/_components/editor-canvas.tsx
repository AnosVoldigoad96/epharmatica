'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { DEFAULT_EDITOR_LABELS, RichText, defaultPreviewBlockCount } from '@epharmatica/editor'
import type { Content, EditorStatus, PickedImage, SubtopicEditorLabels } from '@epharmatica/editor'
import { Button, MonographLabel, useToast } from '@epharmatica/ui'
import { saveDraftContent, updatePreviewBlockCount } from '@/features/content/workflow-actions'
import { MediaPickerSheet } from './media-picker-sheet'

/**
 * Editor canvas host (M4 §5.4 · hi-fi 2e): the Plate surface (dynamically
 * imported — admin-only bundle, reader routes never ship it), the
 * autosave status, the PREVIEW GATE panel (preview_block_count stepper +
 * "Show what anonymous sees" through the REAL renderer over exactly the
 * gated block count — the same server truncation rule, I3), and the
 * workflow footnote. Editing writes through saveDraftContent (validated,
 * serializer-refreshed FTS columns).
 */

const SubtopicEditor = dynamic(
  () => import('@epharmatica/editor').then((mod) => mod.SubtopicEditor),
  { ssr: false, loading: () => <CanvasSkeleton /> },
)

function CanvasSkeleton() {
  return <div className="h-64 animate-pulse border border-line bg-surface" />
}

export function EditorCanvas({
  subtopicId,
  initialContent,
  previewBlockCount,
}: {
  subtopicId: string
  initialContent: Content
  previewBlockCount: number | null
}) {
  const t = useTranslations('admin.content.editor')
  const router = useRouter()
  const { toast } = useToast()
  const [, startTransition] = useTransition()

  const [status, setStatus] = useState<EditorStatus>('clean')
  const [anonView, setAnonView] = useState(false)
  const [latestContent, setLatestContent] = useState<Content>(initialContent)
  const [gateCount, setGateCount] = useState<number | null>(previewBlockCount)

  // Distraction-free mode (founder request): the whole canvas becomes a
  // full-viewport overlay. Esc exits — but only when the editor didn't
  // already consume it (slash/insert menus close on Esc first), and the
  // page behind stops scrolling for the duration.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [expanded])

  // Image picker bridge: the editor asks, the sheet answers (M4 §6 — the
  // picker IS the media library).
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickResolveRef = useRef<((picked: PickedImage | null) => void) | null>(null)
  const onPickImage = useCallback(
    () =>
      new Promise<PickedImage | null>((resolve) => {
        pickResolveRef.current = resolve
        setPickerOpen(true)
      }),
    [],
  )
  const settlePicker = useCallback((picked: PickedImage | null) => {
    pickResolveRef.current?.(picked)
    pickResolveRef.current = null
    setPickerOpen(false)
  }, [])

  // The package ships English defaults; the catalog (rules §8.1) is the
  // source of truth here — every key mirrored under editor.labels.*.
  const editorLabels = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(DEFAULT_EDITOR_LABELS).map((key) => [key, t(`labels.${key}`)]),
      ) as SubtopicEditorLabels,
    [t],
  )

  const effectiveGate = gateCount ?? defaultPreviewBlockCount(latestContent)
  const anonBlocks = useMemo(
    () => latestContent.slice(0, effectiveGate),
    [latestContent, effectiveGate],
  )

  const saveGate = (next: number | null) => {
    setGateCount(next)
    startTransition(async () => {
      const result = await updatePreviewBlockCount(subtopicId, next)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        setGateCount(previewBlockCount)
      }
    })
  }

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-50 overflow-y-auto bg-paper px-4 py-6 md:px-10 lg:px-16'
          : 'min-w-0'
      }
    >
      <div className={expanded ? 'mx-auto w-full max-w-4xl' : undefined}>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <MonographLabel as="div" size="sm">
            {t('canvasLabel')}
          </MonographLabel>
          <span className="flex-1" />
          <span
            className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
              status === 'error'
                ? 'text-danger'
                : status === 'saved'
                  ? 'text-primary'
                  : 'text-ink-2'
            }`}
          >
            {t(`status.${status}`)}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setExpanded((value) => !value)}>
            {expanded ? t('collapseEditor') : t('expandEditor')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnonView((value) => !value)}>
            {anonView ? t('backToEditor') : t('showAnonymous')}
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-3 border border-line bg-surface px-3 py-2">
          <MonographLabel as="span" size="sm">
            {t('previewGateLabel')}
          </MonographLabel>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t('gateFewer')}
              disabled={gateCount !== null && gateCount <= 1}
              onClick={() => saveGate(Math.max(1, effectiveGate - 1))}
              className="h-6 w-6 border border-line font-mono text-[12px] text-ink-2 hover:text-ink disabled:opacity-30"
            >
              −
            </button>
            <span className="min-w-8 text-center font-mono text-[13px] tabular-nums">
              {effectiveGate}
            </span>
            <button
              type="button"
              aria-label={t('gateMore')}
              onClick={() => saveGate(effectiveGate + 1)}
              className="h-6 w-6 border border-line font-mono text-[12px] text-ink-2 hover:text-ink"
            >
              +
            </button>
          </div>
          <span className="text-[11px] text-ink-2">
            {gateCount === null ? t('gateDefaultNote') : t('gateOverrideNote')}
          </span>
          {gateCount !== null ? (
            <button
              type="button"
              className="text-[11px] text-primary underline-offset-2 hover:underline"
              onClick={() => saveGate(null)}
            >
              {t('gateReset')}
            </button>
          ) : null}
        </div>

        {anonView ? (
          <div className="border border-line bg-surface p-5">
            <MonographLabel as="div" size="sm" className="mb-3 text-warn">
              {t('anonViewLabel', { count: effectiveGate })}
            </MonographLabel>
            <RichText content={anonBlocks} />
            <div className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
              {t('anonViewGateNote')}
            </div>
          </div>
        ) : (
          <SubtopicEditor
            initialContent={initialContent}
            labels={editorLabels}
            onPickImage={onPickImage}
            onSave={async (content) => {
              const result = await saveDraftContent(subtopicId, content)
              if (result.ok) {
                setLatestContent(content)
                router.refresh()
              }
              return result
            }}
            onStatusChange={setStatus}
          />
        )}

        <p className="mt-2 text-[11px] text-ink-2">{t('autosaveNote')}</p>

        {pickerOpen ? (
          <MediaPickerSheet open onClose={() => settlePicker(null)} onPick={settlePicker} />
        ) : null}
      </div>
    </div>
  )
}
