'use client'

import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react'
import type { TElement } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement, useReadOnly, useSelected } from 'platejs/react'

import type { CarouselImage } from '../schema/types'
import { useEditorBridges, useEditorLabels } from './context'
import type { PickedImage } from './context'

/**
 * Carousel void chrome — the ImgElement treatment, multiplied: an ordered
 * thumbnail strip with per-slide controls (move left/right, remove, caption
 * input) and an "Add image" button that hands off to the app's media-library
 * picker bridge (ONE PickedImage per invocation — repeated picks build the
 * strip). Without the bridge the button renders disabled with the same
 * `imageDisabledNote` treatment as the Image insert item.
 *
 * The payload is the `images` PROP (data objects, never child nodes), so
 * every mutation is a single setNodes over the whole array — undo-friendly
 * and exactly what the serializer whitelists.
 */

const chromeInputClass =
  'w-full border border-line bg-paper px-2 py-1 font-mono text-xs text-ink placeholder:text-ink-2 focus:border-ink focus:outline-none'

const slideButtonClass =
  'flex size-6 items-center justify-center border border-line bg-surface text-ink-2 hover:border-ink hover:text-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Defensive read: only well-formed slide objects render/persist. */
function readImages(value: unknown): CarouselImage[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (image): image is CarouselImage =>
      isRecord(image) &&
      typeof image.url === 'string' &&
      typeof image.alt === 'string' &&
      typeof image.asset_id === 'string',
  )
}

/** PickedImage → stored slide shape (the picker IS the media library). */
export function pickedImageToCarouselImage(picked: PickedImage): CarouselImage {
  return {
    asset_id: picked.asset_id,
    url: picked.url,
    alt: picked.alt,
    width: picked.width,
    height: picked.height,
  }
}

const captionText = (caption: CarouselImage['caption']): string =>
  caption ? caption.map((node) => node.text).join('') : ''

export function CarouselElement(props: PlateElementProps) {
  const labels = useEditorLabels()
  const bridges = useEditorBridges()
  const readOnly = useReadOnly()
  const selected = useSelected()
  const { editor, element } = props
  const images = readImages(element.images)

  const setImages = (next: CarouselImage[]) =>
    editor.tf.setNodes({ images: next }, { at: props.path })

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= images.length) return
    const next = [...images]
    const [slide] = next.splice(index, 1)
    next.splice(target, 0, slide as CarouselImage)
    setImages(next)
  }

  const remove = (index: number) => {
    setImages(images.filter((_, current) => current !== index))
  }

  const setCaption = (index: number, text: string) => {
    setImages(
      images.map((image, current) => {
        if (current !== index) return image
        const { caption: _dropped, ...rest } = image
        return text === '' ? rest : { ...rest, caption: [{ text }] }
      }),
    )
  }

  const addImage = () => {
    const pick = bridges.pickImage
    if (!pick) return
    void pick().then((picked) => {
      if (!picked) return
      // Re-resolve path AND images at resolution time — the picker is
      // async, the document may have moved on.
      const path = editor.api.findPath(element)
      if (!path) return
      const entry = editor.api.node<TElement>(path)
      if (!entry) return
      editor.tf.setNodes(
        { images: [...readImages(entry[0].images), pickedImageToCarouselImage(picked)] },
        { at: path },
      )
      editor.tf.focus()
    })
  }

  return (
    <PlateElement {...props} as="figure" className="my-4">
      <div
        contentEditable={false}
        className={`border border-line bg-paper p-2 ${selected ? 'bg-primary-tint' : ''}`}
      >
        {images.length === 0 ? (
          <p className="select-none py-4 text-center font-mono text-[10px] uppercase tracking-widest text-ink-2">
            {labels.carouselEmptyNote}
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto">
            {images.map((image, index) => (
              <div
                key={`${image.asset_id}-${index}`}
                className="w-40 shrink-0 border border-line bg-surface p-1.5"
              >
                <img
                  src={image.url}
                  alt={image.alt}
                  className="aspect-square w-full border border-line object-cover"
                />
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="me-auto select-none font-mono text-[10px] text-ink-2">
                    {index + 1} / {images.length}
                  </span>
                  {!readOnly ? (
                    <>
                      <button
                        type="button"
                        aria-label={labels.carouselMoveImageLeft}
                        title={labels.carouselMoveImageLeft}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        className={slideButtonClass}
                      >
                        <ChevronLeft className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={labels.carouselMoveImageRight}
                        title={labels.carouselMoveImageRight}
                        disabled={index === images.length - 1}
                        onClick={() => move(index, 1)}
                        className={slideButtonClass}
                      >
                        <ChevronRight className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={labels.carouselRemoveImage}
                        title={labels.carouselRemoveImage}
                        onClick={() => remove(index)}
                        className={slideButtonClass}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </>
                  ) : null}
                </div>
                <input
                  aria-label={labels.captionPlaceholder}
                  placeholder={labels.captionPlaceholder}
                  value={captionText(image.caption)}
                  disabled={readOnly}
                  onChange={(event) => setCaption(index, event.target.value)}
                  className={`mt-1.5 ${chromeInputClass}`}
                />
              </div>
            ))}
          </div>
        )}
        {!readOnly ? (
          <button
            type="button"
            disabled={!bridges.pickImage}
            title={bridges.pickImage ? labels.carouselAddImage : labels.imageDisabledNote}
            onClick={addImage}
            className="mt-2 flex h-7 select-none items-center gap-1.5 border border-ink bg-surface px-2 font-mono text-[11px] uppercase text-ink hover:bg-paper disabled:opacity-40 disabled:hover:bg-surface"
          >
            <ImagePlus className="size-3.5" aria-hidden />
            {labels.carouselAddImage}
          </button>
        ) : null}
      </div>
      {props.children}
    </PlateElement>
  )
}
