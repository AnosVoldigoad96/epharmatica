// @epharmatica/ui — the 13 system primitives (STYLE.md §16) + the form
// primitives (STYLE.md §11). Exports are added as primitives land; consumers
// import only from this entry point.

// ---- System primitives ----------------------------------------------------

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

export { AvatarSquare } from './system/avatar-square'
export type { AvatarSquareProps } from './system/avatar-square'

// ---- Form primitives (1.A accounts core) ----------------------------------

export { Button } from './form/button'
export type { ButtonProps } from './form/button'

export { Field, SelectShell, fieldClass, selectClass } from './form/field'
export type { FieldProps, SelectShellProps } from './form/field'

export { Checkbox } from './form/checkbox'
export type { CheckboxProps } from './form/checkbox'

export { SegmentedControl } from './form/segmented-control'
export type { SegmentedControlProps, SegmentedControlOption } from './form/segmented-control'
