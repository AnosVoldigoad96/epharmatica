/**
 * Every user-facing string of the editing surface, in one flat map. Apps
 * pass translated overrides through `SubtopicEditorProps.labels` (merged
 * over these English defaults) — the package stays next-intl-free, the
 * catalog rule (rules.md §8.1) is honored at the app boundary.
 *
 * Callout variant names and Drug Card field labels are schema-owned chrome
 * and come from CALLOUT_LABELS / DRUG_CARD_FIELD_LABELS (schema/labels.ts),
 * exactly like the read renderer.
 */
export type SubtopicEditorLabels = {
  /** aria-label for the editable content region. */
  editorAriaLabel: string

  /** Block-type select (toolbar). */
  blockTypeLabel: string
  blockParagraph: string
  blockHeading2: string
  blockHeading3: string
  blockQuote: string

  /** Mark toggle tooltips. */
  markBold: string
  markItalic: string
  markUnderline: string
  markStrikethrough: string
  markCode: string
  markSubscript: string
  markSuperscript: string

  /** List controls. */
  listBulleted: string
  listNumbered: string
  listIndent: string
  listOutdent: string

  /** Link controls + inline URL row (no window.prompt). */
  linkAdd: string
  linkRemove: string
  linkUrlPlaceholder: string
  linkApply: string
  linkCancel: string

  /** Insert menu. */
  insertMenu: string
  insertTable: string
  insertCallout: string
  insertCodeBlock: string
  insertToc: string
  insertDrugCard: string
  insertVideo: string
  insertImage: string
  /** Title/tooltip on the disabled Image button (media library lands next slice). */
  imageDisabledNote: string

  /** Video insert mini-form. */
  videoUrlPlaceholder: string
  videoCaptionPlaceholder: string
  videoInsert: string
  videoCancel: string
  videoInvalidUrl: string

  /** Editing-surface chrome rendered by node components. */
  tocPlaceholder: string
  captionPlaceholder: string
  calloutVariantLabel: string

  /** Status pill. */
  statusClean: string
  statusDirty: string
  statusSaving: string
  statusSaved: string
  statusError: string

  /** Prefix for the inline validation-error note under the toolbar. */
  validationErrorPrefix: string
}

export const DEFAULT_EDITOR_LABELS: SubtopicEditorLabels = {
  editorAriaLabel: 'Subtopic content',

  blockTypeLabel: 'Block type',
  blockParagraph: 'Paragraph',
  blockHeading2: 'Heading 2',
  blockHeading3: 'Heading 3',
  blockQuote: 'Quote',

  markBold: 'Bold',
  markItalic: 'Italic',
  markUnderline: 'Underline',
  markStrikethrough: 'Strikethrough',
  markCode: 'Inline code',
  markSubscript: 'Subscript',
  markSuperscript: 'Superscript',

  listBulleted: 'Bulleted list',
  listNumbered: 'Numbered list',
  listIndent: 'Indent list item',
  listOutdent: 'Outdent list item',

  linkAdd: 'Add link',
  linkRemove: 'Remove link',
  linkUrlPlaceholder: 'https://…',
  linkApply: 'Apply link',
  linkCancel: 'Cancel',

  insertMenu: 'Insert',
  insertTable: 'Table (3×3)',
  insertCallout: 'Callout',
  insertCodeBlock: 'Code block',
  insertToc: 'Table of contents',
  insertDrugCard: 'Drug Card',
  insertVideo: 'Video (YouTube)',
  insertImage: 'Image',
  imageDisabledNote: 'Images arrive with the media library (next slice)',

  videoUrlPlaceholder: 'YouTube URL',
  videoCaptionPlaceholder: 'Caption (required)',
  videoInsert: 'Insert video',
  videoCancel: 'Cancel',
  videoInvalidUrl: 'Not a recognizable YouTube URL',

  tocPlaceholder: 'Table of contents — renders from headings',
  captionPlaceholder: 'Caption…',
  calloutVariantLabel: 'Callout variant',

  statusClean: 'Clean',
  statusDirty: 'Unsaved',
  statusSaving: 'Saving…',
  statusSaved: 'Saved',
  statusError: 'Error',

  validationErrorPrefix: 'Cannot save',
}
