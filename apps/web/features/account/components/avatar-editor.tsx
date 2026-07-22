'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslations } from 'next-intl'
import { Button, MonographLabel, useToast } from '@epharmatica/ui'
import { uploadAvatar } from '../actions'

/**
 * Avatar crop dialog (M2 §4.5 · wireframes §6 — no crop UI is drawn in the
 * canvases, designed fresh here; dependency-free by contract). Square crop
 * viewport on a 512×512 canvas: drag to reposition (pointer events), zoom
 * via a range input; export `canvas.toBlob('image/webp', q)` stepping
 * 0.9 → 0.75 → 0.6 until ≤ 1 MiB, then FormData → uploadAvatar (the server
 * re-checks size + magic bytes and swaps write-then-delete).
 *
 * Overlay: fixed scrim (both-theme token) + centered square surface panel at
 * z-[var(--z-dialog)]; Esc and scrim click close; focus moves into the panel
 * on open and restores on close; Tab cycles inside (minimal trap).
 */
const EXPORT_SIZE = 512
const MAX_BYTES = 1_048_576
const QUALITY_STEPS = [0.9, 0.75, 0.6] as const
const MIN_ZOOM = 1
const MAX_ZOOM = 3
// Keyboard crop nudge (image-space px); Shift takes a larger step.
const CROP_NUDGE = 4
const CROP_NUDGE_SHIFT = 20

type Crop = { x: number; y: number }

function clampCrop(x: number, y: number, side: number, image: HTMLImageElement): Crop {
  return {
    x: Math.min(Math.max(x, 0), image.naturalWidth - side),
    y: Math.min(Math.max(y, 0), image.naturalHeight - side),
  }
}

function toWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', quality)
  })
}

export function AvatarEditor({
  file,
  onClose,
  onSaved,
}: {
  file: File
  onClose: () => void
  onSaved: (avatarUrl: string) => void
}) {
  const t = useTranslations('settings.profile.avatar')
  const { toast } = useToast()

  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0 })
  const [pending, setPending] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; cropX: number; cropY: number } | null>(
    null,
  )

  // Load the picked file once; a decode failure closes with the badType copy.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      setImage(img)
      setZoom(1)
      setCrop({ x: (img.naturalWidth - side) / 2, y: (img.naturalHeight - side) / 2 })
    }
    img.onerror = () => {
      toast({ title: t('errors.badType'), variant: 'error' })
      onClose()
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file, onClose, t, toast])

  // Focus in on open, restore on close.
  useEffect(() => {
    restoreRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => restoreRef.current?.focus()
  }, [])

  // Redraw the 512×512 preview — it doubles as the export source.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom
    ctx.clearRect(0, 0, EXPORT_SIZE, EXPORT_SIZE)
    ctx.drawImage(image, crop.x, crop.y, side, side, 0, 0, EXPORT_SIZE, EXPORT_SIZE)
  }, [crop, image, zoom])

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!image) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      cropX: crop.x,
      cropY: crop.y,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag || !image) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) {
      return
    }
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom
    const scale = side / rect.width
    // Dragging the image right moves the crop window left — hence minus.
    setCrop(
      clampCrop(
        drag.cropX - (event.clientX - drag.startX) * scale,
        drag.cropY - (event.clientY - drag.startY) * scale,
        side,
        image,
      ),
    )
  }

  const handlePointerEnd = () => {
    dragRef.current = null
  }

  // Keyboard reposition: Arrow keys nudge the crop window, Shift steps larger.
  // Reuses clampCrop so the window can never escape the image bounds.
  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    if (!image) {
      return
    }
    const step = event.shiftKey ? CROP_NUDGE_SHIFT : CROP_NUDGE
    let dx = 0
    let dy = 0
    switch (event.key) {
      case 'ArrowLeft':
        dx = -step
        break
      case 'ArrowRight':
        dx = step
        break
      case 'ArrowUp':
        dy = -step
        break
      case 'ArrowDown':
        dy = step
        break
      default:
        return
    }
    event.preventDefault()
    const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom
    setCrop((current) => clampCrop(current.x + dx, current.y + dy, side, image))
  }

  const handleZoom = (value: number) => {
    if (!image) {
      return
    }
    const minSide = Math.min(image.naturalWidth, image.naturalHeight)
    const oldSide = minSide / zoom
    const newSide = minSide / value
    // Zoom about the current crop center.
    const centerX = crop.x + oldSide / 2
    const centerY = crop.y + oldSide / 2
    setZoom(value)
    setCrop(clampCrop(centerX - newSide / 2, centerY - newSide / 2, newSide, image))
  }

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !image || pending) {
      return
    }
    setPending(true)
    try {
      let blob: Blob | null = null
      for (const quality of QUALITY_STEPS) {
        const candidate = await toWebpBlob(canvas, quality)
        // A browser without WebP encode support silently falls back to PNG —
        // the server would reject it on magic bytes, so fail early instead.
        if (!candidate || candidate.type !== 'image/webp') {
          blob = null
          break
        }
        blob = candidate
        if (candidate.size <= MAX_BYTES) {
          break
        }
      }
      if (!blob) {
        toast({ title: t('errors.generic'), variant: 'error' })
        return
      }
      if (blob.size > MAX_BYTES) {
        toast({ title: t('errors.tooLarge'), variant: 'error' })
        return
      }

      const formData = new FormData()
      formData.append('file', blob, 'avatar.webp')
      const result = await uploadAvatar(formData)
      if (result.ok) {
        toast({ title: t('saved') })
        onSaved(result.avatarUrl)
      } else {
        toast({ title: result.error, variant: 'error' })
      }
    } catch {
      toast({ title: t('errors.generic'), variant: 'error' })
    } finally {
      setPending(false)
    }
  }, [image, onSaved, pending, t, toast])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    // Minimal focus trap: keep Tab cycling inside the panel.
    const panel = panelRef.current
    if (!panel) {
      return
    }
    // Exclude disabled controls so Tab-wrap never lands on an unfocusable node.
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled'))
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!first || !last) {
      event.preventDefault()
      panel.focus()
      return
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[var(--z-dialog)] flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      <div aria-hidden className="absolute inset-0 bg-scrim" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogTitle')}
        tabIndex={-1}
        className="relative w-full max-w-[360px] border border-ink bg-surface p-5 outline-none"
      >
        <MonographLabel as="h2" rule="hard">
          {t('dialogTitle')}
        </MonographLabel>

        <canvas
          ref={canvasRef}
          width={EXPORT_SIZE}
          height={EXPORT_SIZE}
          tabIndex={0}
          aria-label={t('dialogTitle')}
          className="mt-4 block w-full cursor-move touch-none border border-line bg-paper"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleCanvasKeyDown}
        />

        <label className="mt-4 flex items-center gap-3">
          <MonographLabel size="sm" as="span" className="flex-none">
            {t('zoom')}
          </MonographLabel>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!image}
            onChange={(event) => handleZoom(Number(event.target.value))}
            className="h-6 min-w-0 flex-1 cursor-pointer accent-primary [@media(pointer:coarse)]:h-11"
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-3">
          <Button pending={pending} disabled={!image} onClick={handleSave}>
            {t('save')}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
