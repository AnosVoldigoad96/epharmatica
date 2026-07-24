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
  Block,
  BlockType,
  BlockquoteBlock,
  CalloutBlock,
  CalloutVariant,
  CodeBlock,
  CodeLine,
  Content,
  DrugCardBlock,
  DrugCardFieldKey,
  DrugCardFields,
  HeadingBlock,
  ImageBlock,
  InlineNode,
  LinkNode,
  ListStyleType,
  NestedParagraph,
  ParagraphBlock,
  TableBlock,
  TableCell,
  TableRow,
  TextNode,
  TocBlock,
  VideoBlock,
  VoidChildren,
} from './schema/types'
export { CALLOUT_VARIANTS, DRUG_CARD_FIELD_KEYS, isTextNode } from './schema/types'

export { CALLOUT_LABELS, DRUG_CARD_FIELD_LABELS } from './schema/labels'

export { parseYouTubeUrl, youTubeEmbedUrl, youTubeThumbnailUrl } from './schema/youtube'

export { blockSchema, contentSchema, validateContent } from './schema/validate'
export type { ValidateContentResult } from './schema/validate'

export {
  blockPlainText,
  countWords,
  defaultPreviewBlockCount,
  deriveReadingMinutes,
  derivePrimaryVideoUrl,
  getHeadingsText,
  getPlainText,
  inlineText,
  paragraphsText,
} from './serializers'

export { getAnchorKind, getTextRuns } from './anchors'
export type { AnchorKind, AnchorPath } from './anchors'

export { RichText } from './render/rich-text'
export type { RichTextComponents, RichTextLabels, RichTextProps } from './render/rich-text'

export { FIXTURE_DOCUMENT } from './fixtures'
