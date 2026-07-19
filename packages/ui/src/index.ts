// @epharmatica/ui — the 13 system primitives (STYLE.md §16) + shadcn-owned
// components. Exports are added as primitives land; consumers import only
// from this entry point.

export { MonographLabel } from './system/monograph-label'
export type { MonographLabelProps } from './system/monograph-label'

export { StateGlyph } from './system/state-glyph'
export type { StateGlyphProps, StateGlyphState } from './system/state-glyph'

export { ProgressStrip } from './system/progress-strip'
export type { ProgressStripProps } from './system/progress-strip'

export { BlisterGrid, BlisterCell } from './system/blister-grid'
export type { BlisterGridProps, BlisterCellProps } from './system/blister-grid'

export { Stamp } from './system/stamp'
export type { StampProps } from './system/stamp'

export { SelectionPopover } from './system/selection-popover'
export type { SelectionPopoverProps, HighlightColor } from './system/selection-popover'

export { ActionBar } from './system/action-bar'
export type { ActionBarProps, ActionBarAction } from './system/action-bar'

export { StackedRecord } from './system/stacked-record'
export type { StackedRecordProps, StackedRecordRow } from './system/stacked-record'

export { OfflineBanner } from './system/offline-banner'
export type { OfflineBannerProps } from './system/offline-banner'

export { ToastProvider, useToast } from './system/toast'
export type { ToastProviderProps, ToastOptions, ToastContextValue } from './system/toast'

export { TextSizeControl } from './system/text-size-control'
export type { TextSizeControlProps, TextSize } from './system/text-size-control'

export { ReadingBar } from './system/reading-bar'
export type { ReadingBarProps } from './system/reading-bar'

export { WaitlistForm } from './system/waitlist-form'
export type { WaitlistFormProps, WaitlistResult } from './system/waitlist-form'
