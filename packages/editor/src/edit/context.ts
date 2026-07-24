'use client'

import { createContext, useContext } from 'react'

import type { SubtopicEditorLabels } from './labels'
import { DEFAULT_EDITOR_LABELS } from './labels'

/**
 * Editor-chrome contexts. <SubtopicEditor/> provides both; node components
 * (paragraph placeholder, slash menu, drag handles) consume them so the
 * package needs no prop drilling through Plate's render pipeline.
 */

/** What the app's media-library picker resolves with (M4 §6 — the Plate
 * image block's picker IS the library; the schema requires asset_id). */
export type PickedImage = {
  asset_id: string
  url: string
  alt: string
  width: number
  height: number
}

/**
 * App bridges reachable from inside the editing surface (slash menu, insert
 * menu): the inline video form lives in the toolbar chrome, the image picker
 * in the app. `pickImage` absent → Image inserts render disabled with
 * `labels.imageDisabledNote`.
 */
export type EditorBridges = {
  openVideoForm: () => void
  pickImage?: () => Promise<PickedImage | null>
}

const EditorLabelsContext = createContext<SubtopicEditorLabels>(DEFAULT_EDITOR_LABELS)

export const EditorLabelsProvider = EditorLabelsContext.Provider

export function useEditorLabels(): SubtopicEditorLabels {
  return useContext(EditorLabelsContext)
}

const EditorBridgesContext = createContext<EditorBridges>({
  openVideoForm: () => undefined,
})

export const EditorBridgesProvider = EditorBridgesContext.Provider

export function useEditorBridges(): EditorBridges {
  return useContext(EditorBridgesContext)
}
