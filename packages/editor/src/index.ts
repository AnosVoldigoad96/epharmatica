/**
 * @epharmatica/editor — the Plate blast-shield (I4, I9).
 *
 * Everything product code may know about rich text is exported here: the
 * block schema + validation, the <RichText/> read renderer, the block-walk
 * serializers, and the anchor text-run contract. The Plate editing surface
 * (admin-only) ships from here too, as it lands — never from slate/platejs
 * directly.
 */

export type {
  Alignment,
  Block,
  BlockType,
  BlockquoteBlock,
  CalloutBlock,
  CalloutVariant,
  CarouselBlock,
  CarouselImage,
  CodeBlock,
  CodeLine,
  ColumnChildBlock,
  ColumnGroupBlock,
  ColumnNode,
  Content,
  DateNode,
  DrugCardBlock,
  DrugCardFieldKey,
  DrugCardFields,
  EquationBlock,
  HeadingBlock,
  HrBlock,
  ImageBlock,
  InlineEquationNode,
  InlineNode,
  LinkNode,
  ListBlock,
  ListItemContentNode,
  ListItemNode,
  ListStyleType,
  NestedListNode,
  NestedParagraph,
  ParagraphBlock,
  TableBlock,
  TableCell,
  TableRow,
  TextNode,
  TocBlock,
  ToggleBlock,
  VideoBlock,
  VoidChildren,
} from './schema/types'
export {
  CALLOUT_VARIANTS,
  CONTENT_SCHEMA_VERSION,
  DRUG_CARD_FIELD_KEYS,
  isDateNode,
  isInlineEquationNode,
  isTextNode,
} from './schema/types'

export { upgradeLegacyLists } from './schema/legacy-lists'
export { formatDateDisplay } from './schema/date'

export { CALLOUT_LABELS, DRUG_CARD_FIELD_LABELS } from './schema/labels'

export {
  isYouTubeShortsUrl,
  parseYouTubeUrl,
  youTubeEmbedUrl,
  youTubeShortsThumbnailUrl,
  youTubeThumbnailUrl,
} from './schema/youtube'

export { blockSchema, contentSchema, validateContent } from './schema/validate'
export type { ValidateContentResult } from './schema/validate'

export {
  blockPlainText,
  countWords,
  defaultPreviewBlockCount,
  deriveReadingMinutes,
  derivePrimaryVideoUrl,
  getHeadingsText,
  getImageAssetIds,
  getPlainText,
  inlineText,
  listItemsText,
  paragraphsText,
} from './serializers'

export { getAllTextRuns, getAnchorKind, getTextRuns } from './anchors'
export type { AnchorKind, AnchorPath, TextRun } from './anchors'

export { reanchorHighlights } from './reanchor'
export type { AnchorV1, ReanchorHighlight, ReanchorResult } from './reanchor'

export { RichText } from './render/rich-text'
export type { RichTextComponents, RichTextLabels, RichTextProps } from './render/rich-text'

/*
 * Client-side KaTeX equation renderers (member-unlock path): katex arrives
 * via DYNAMIC import only when an equation mounts, so importing these from
 * a client component never puts the engine in a shared chunk. The
 * server-side pair (StaticEquation/StaticInlineEquation) deliberately lives
 * on the `@epharmatica/editor/static` subpath instead — its static katex
 * import must stay out of every client module graph.
 */
export { ClientEquation, ClientInlineEquation } from './render/equation-client'

export { FIXTURE_DOCUMENT, LEGACY_FLAT_LIST_DOCUMENT } from './fixtures'

/*
 * Editing surface (admin-only). Exported from the main index on purpose:
 * the app loads <SubtopicEditor/> via next/dynamic (code-split), and reader
 * routes import only <RichText/> — platejs and the editor tree are
 * tree-shaken out of every bundle that doesn't render the editor, so no
 * separate export path is needed.
 */
export { SubtopicEditor } from './edit/subtopic-editor'
export type {
  EditorSaveResult,
  EditorStatus,
  PickedImage,
  SubtopicEditorProps,
} from './edit/subtopic-editor'
export { DEFAULT_EDITOR_LABELS } from './edit/labels'
export type { SubtopicEditorLabels } from './edit/labels'
export { fromEditorValue } from './edit/serialize'
