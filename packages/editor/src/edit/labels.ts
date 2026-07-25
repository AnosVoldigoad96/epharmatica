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
  blockToggle: string

  /** Mark toggle tooltips. */
  markBold: string
  markItalic: string
  markUnderline: string
  markStrikethrough: string
  markCode: string
  markSubscript: string
  markSuperscript: string
  markHighlight: string
  markKbd: string

  /** List controls. */
  listBulleted: string
  listNumbered: string
  listIndent: string
  listOutdent: string

  /** Block indent controls (generic — also nests blocks under toggles). */
  indentIncrease: string
  indentDecrease: string

  /** Alignment dropdown. */
  alignLabel: string
  alignLeft: string
  alignCenter: string
  alignRight: string
  alignJustify: string

  /** Line-height dropdown. */
  lineHeightLabel: string
  lineHeightDefault: string

  /** Font size dropdown. */
  fontSizeLabel: string
  fontSizeDefault: string

  /** Color pickers (text + background). */
  textColorLabel: string
  backgroundColorLabel: string
  colorDefault: string
  colorCustom: string

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
  insertDivider: string
  insertDate: string
  insertEquation: string
  insertInlineEquation: string
  insertColumns2: string
  insertColumns3: string
  /** Title/tooltip on the disabled Image button (media library lands next slice). */
  imageDisabledNote: string

  /** Slash command menu ("/" at the caret). */
  slashMenuLabel: string
  slashInputLabel: string
  slashGroupBlocks: string
  slashGroupLayout: string
  slashGroupCallouts: string
  slashGroupMedia: string
  slashNoResults: string

  /** ':' emoji combobox. */
  emojiInputLabel: string
  emojiMenuLabel: string

  /** Table menu (contextual, selection inside a table). */
  tableMenuLabel: string
  tableRowAdd: string
  tableRowRemove: string
  tableColAdd: string
  tableColRemove: string
  tableMergeCells: string
  tableSplitCell: string
  tableHeaderRow: string
  tableHeaderCol: string
  tableDelete: string

  /** Column layout menu (contextual, selection inside a column group). */
  columnLayoutLabel: string
  columnLayout5050: string
  columnLayout333: string
  columnLayout7030: string
  columnLayout3070: string

  /** Empty-document placeholder on the first paragraph. */
  emptyPlaceholder: string

  /** Drag handle (block gutter). */
  dragHandleLabel: string

  /** History controls. */
  undo: string
  redo: string

  /** Floating selection toolbar. */
  floatingToolbarLabel: string

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
  toggleButtonLabel: string
  dateEditLabel: string
  datePlaceholder: string
  codeLangLabel: string

  /** KaTeX equation voids (popover TeX editor + empty states). */
  equationInputLabel: string
  equationPlaceholder: string
  equationInlinePlaceholder: string
  equationDone: string
  equationEmpty: string
  equationEmptyInline: string

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
  blockToggle: 'Toggle',

  markBold: 'Bold',
  markItalic: 'Italic',
  markUnderline: 'Underline',
  markStrikethrough: 'Strikethrough',
  markCode: 'Inline code',
  markSubscript: 'Subscript',
  markSuperscript: 'Superscript',
  markHighlight: 'Highlight',
  markKbd: 'Keyboard key',

  listBulleted: 'Bulleted list',
  listNumbered: 'Numbered list',
  listIndent: 'Indent list item',
  listOutdent: 'Outdent list item',

  indentIncrease: 'Indent',
  indentDecrease: 'Outdent',

  alignLabel: 'Align',
  alignLeft: 'Align left',
  alignCenter: 'Align center',
  alignRight: 'Align right',
  alignJustify: 'Justify',

  lineHeightLabel: 'Line height',
  lineHeightDefault: 'Default',

  fontSizeLabel: 'Font size',
  fontSizeDefault: 'Default',

  textColorLabel: 'Text color',
  backgroundColorLabel: 'Background color',
  colorDefault: 'Default',
  colorCustom: 'Custom…',

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
  insertDivider: 'Divider',
  insertDate: 'Date',
  insertEquation: 'Equation',
  insertInlineEquation: 'Inline equation',
  insertColumns2: 'Two columns',
  insertColumns3: 'Three columns',
  imageDisabledNote: 'Images arrive with the media library (next slice)',

  slashMenuLabel: 'Insert block',
  slashInputLabel: 'Filter blocks',
  slashGroupBlocks: 'Blocks',
  slashGroupLayout: 'Layout',
  slashGroupCallouts: 'Callouts',
  slashGroupMedia: 'Media',
  slashNoResults: 'No results',

  emojiInputLabel: 'Search emoji',
  emojiMenuLabel: 'Insert emoji',

  tableMenuLabel: 'Table',
  tableRowAdd: 'Insert row below',
  tableRowRemove: 'Delete row',
  tableColAdd: 'Insert column after',
  tableColRemove: 'Delete column',
  tableMergeCells: 'Merge cells',
  tableSplitCell: 'Split cell',
  tableHeaderRow: 'Toggle header row',
  tableHeaderCol: 'Toggle header column',
  tableDelete: 'Delete table',

  columnLayoutLabel: 'Column layout',
  columnLayout5050: 'Two equal columns',
  columnLayout333: 'Three equal columns',
  columnLayout7030: 'Wide + narrow',
  columnLayout3070: 'Narrow + wide',

  emptyPlaceholder: 'Type / for commands…',

  dragHandleLabel: 'Drag to reorder block',

  undo: 'Undo',
  redo: 'Redo',

  floatingToolbarLabel: 'Text formatting',

  videoUrlPlaceholder: 'YouTube URL',
  videoCaptionPlaceholder: 'Caption (required)',
  videoInsert: 'Insert video',
  videoCancel: 'Cancel',
  videoInvalidUrl: 'Not a recognizable YouTube URL',

  tocPlaceholder: 'Table of contents — renders from headings',
  captionPlaceholder: 'Caption…',
  calloutVariantLabel: 'Callout variant',
  toggleButtonLabel: 'Expand or collapse',
  dateEditLabel: 'Edit date',
  datePlaceholder: 'Pick a date',
  codeLangLabel: 'Language',

  equationInputLabel: 'TeX expression',
  equationPlaceholder: 'f(x) = ax^2 + bx + c',
  equationInlinePlaceholder: 'E = mc^2',
  equationDone: 'Done',
  equationEmpty: 'Add a TeX equation',
  equationEmptyInline: 'New equation',

  statusClean: 'Clean',
  statusDirty: 'Unsaved',
  statusSaving: 'Saving…',
  statusSaved: 'Saved',
  statusError: 'Error',

  validationErrorPrefix: 'Cannot save',
}
