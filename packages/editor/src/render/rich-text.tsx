import type { ComponentType, ReactNode } from 'react'
import { Fragment } from 'react'

import { CALLOUT_LABELS, DRUG_CARD_FIELD_LABELS } from '../schema/labels'
import type {
  Block,
  CalloutVariant,
  Content,
  DrugCardFieldKey,
  ImageBlock,
  InlineNode,
  ListStyleType,
  NestedParagraph,
  ParagraphBlock,
  TextNode,
  VideoBlock,
} from '../schema/types'
import { DRUG_CARD_FIELD_KEYS, isTextNode } from '../schema/types'

/**
 * <RichText/> — the ONE read renderer (I4). Server-component-safe and
 * dependency-free: it walks stored block JSON directly, so public reader
 * routes never ship editor code (perf budget, rules.md §9.6). Interaction
 * leaves (video facade, zoomable images) are injected by the app through
 * `components`; everything else renders as semantic HTML with stable
 * `rt-*` class hooks and `data-block-id` markers (the highlight layer's
 * DOM contract).
 */

export type RichTextComponents = {
  img?: ComponentType<{ block: ImageBlock }>
  video?: ComponentType<{ block: VideoBlock }>
}

export type RichTextLabels = {
  callouts?: Record<CalloutVariant, string>
  drugCardFields?: Record<DrugCardFieldKey, string>
  /** aria-label for the TOC nav. */
  toc?: string
}

export type RichTextProps = {
  content: Content
  components?: RichTextComponents
  labels?: RichTextLabels
}

function renderTextNode(node: TextNode, key: number): ReactNode {
  let rendered: ReactNode = node.text
  if (node.code) rendered = <code>{rendered}</code>
  if (node.sub) rendered = <sub>{rendered}</sub>
  if (node.sup) rendered = <sup>{rendered}</sup>
  if (node.strikethrough) rendered = <s>{rendered}</s>
  if (node.underline) rendered = <u>{rendered}</u>
  if (node.italic) rendered = <em>{rendered}</em>
  if (node.bold) rendered = <strong>{rendered}</strong>
  return <Fragment key={key}>{rendered}</Fragment>
}

function renderInline(nodes: InlineNode[]): ReactNode {
  return nodes.map((node, index) =>
    isTextNode(node) ? (
      renderTextNode(node, index)
    ) : (
      <a key={index} className="rt-link" href={node.url}>
        {node.children.map(renderTextNode)}
      </a>
    ),
  )
}

function renderNestedParagraphs(paragraphs: NestedParagraph[]): ReactNode {
  return paragraphs.map((paragraph, index) => <p key={index}>{renderInline(paragraph.children)}</p>)
}

/** A run of consecutive flat list items, grouped for <ul>/<ol> rendering. */
type ListGroup = { kind: 'list'; style: ListStyleType; items: ParagraphBlock[] }
type RenderUnit = Block | ListGroup

function isListItem(block: Block): block is ParagraphBlock {
  return block.type === 'p' && block.listStyleType !== undefined
}

function groupListItems(content: Content): RenderUnit[] {
  const units: RenderUnit[] = []
  for (const block of content) {
    const last = units[units.length - 1]
    if (isListItem(block)) {
      const style = block.listStyleType as ListStyleType
      if (last && 'kind' in last && last.style === style) {
        last.items.push(block)
      } else {
        units.push({ kind: 'list', style, items: [block] })
      }
    } else {
      units.push(block)
    }
  }
  return units
}

/**
 * Renders one indent level of a flat-list run; items deeper than the
 * current level nest inside the preceding item's <li>. A malformed run
 * that starts too deep clamps to the current level.
 */
function renderListLevel(items: ParagraphBlock[], style: ListStyleType, level: number): ReactNode {
  const listChildren: ReactNode[] = []
  let index = 0
  while (index < items.length) {
    const item = items[index] as ParagraphBlock
    index += 1
    const deeper: ParagraphBlock[] = []
    while (index < items.length && ((items[index] as ParagraphBlock).indent ?? 1) > level) {
      deeper.push(items[index] as ParagraphBlock)
      index += 1
    }
    listChildren.push(
      <li key={item.id} data-block-id={item.id}>
        {renderInline(item.children)}
        {deeper.length > 0 ? renderListLevel(deeper, style, level + 1) : null}
      </li>,
    )
  }
  const ListTag = style === 'decimal' ? 'ol' : 'ul'
  return <ListTag className="rt-list">{listChildren}</ListTag>
}

function renderToc(content: Content, block: Block, tocLabel: string): ReactNode {
  const headings = content.filter((candidate) => candidate.type === 'h2' || candidate.type === 'h3')
  return (
    <nav key={block.id} data-block-id={block.id} className="rt-toc" aria-label={tocLabel}>
      <ol>
        {headings.map((heading) =>
          heading.type === 'h2' || heading.type === 'h3' ? (
            <li key={heading.id} className={heading.type === 'h3' ? 'rt-toc__sub' : undefined}>
              <a href={`#h-${heading.id}`}>{renderInline(heading.children)}</a>
            </li>
          ) : null,
        )}
      </ol>
    </nav>
  )
}

function DefaultImage({ block }: { block: ImageBlock }) {
  return (
    <img
      src={block.url}
      alt={block.alt}
      width={block.width}
      height={block.height}
      loading="lazy"
      style={{ aspectRatio: `${block.width} / ${block.height}` }}
    />
  )
}

/**
 * Dependency-free fallback: a caption-labelled link. The app injects the
 * lite-YouTube facade (click-to-load, youtube-nocookie) via components.video.
 */
function DefaultVideo({ block }: { block: VideoBlock }) {
  return (
    <p className="rt-video__placeholder">
      <a className="rt-link" href={block.url}>
        {block.caption.map(renderTextNode)}
      </a>
    </p>
  )
}

export function RichText({ content, components, labels }: RichTextProps) {
  const calloutLabels = labels?.callouts ?? CALLOUT_LABELS
  const fieldLabels = labels?.drugCardFields ?? DRUG_CARD_FIELD_LABELS
  const Image = components?.img ?? DefaultImage
  const Video = components?.video ?? DefaultVideo

  const renderBlock = (block: Block): ReactNode => {
    switch (block.type) {
      case 'p':
        return (
          <p key={block.id} data-block-id={block.id}>
            {renderInline(block.children)}
          </p>
        )
      case 'h2':
        return (
          <h2 key={block.id} id={`h-${block.id}`} data-block-id={block.id}>
            {renderInline(block.children)}
          </h2>
        )
      case 'h3':
        return (
          <h3 key={block.id} id={`h-${block.id}`} data-block-id={block.id}>
            {renderInline(block.children)}
          </h3>
        )
      case 'blockquote':
        return (
          <blockquote key={block.id} data-block-id={block.id}>
            {renderInline(block.children)}
          </blockquote>
        )
      case 'callout':
        return (
          <aside
            key={block.id}
            data-block-id={block.id}
            className={`rt-callout rt-callout--${block.variant}`}
          >
            <p className="rt-callout__label">{calloutLabels[block.variant]}</p>
            {renderNestedParagraphs(block.children)}
          </aside>
        )
      case 'table':
        return (
          <div key={block.id} data-block-id={block.id} className="rt-table-wrap">
            <table className="rt-table">
              <tbody>
                {block.children.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.children.map((cell, colIndex) =>
                      cell.type === 'th' ? (
                        <th key={colIndex} scope={rowIndex === 0 ? 'col' : 'row'}>
                          {renderNestedParagraphs(cell.children)}
                        </th>
                      ) : (
                        <td key={colIndex}>{renderNestedParagraphs(cell.children)}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'img':
        return (
          <figure key={block.id} data-block-id={block.id} className="rt-figure">
            <Image block={block} />
            {block.caption && block.caption.length > 0 ? (
              <figcaption>{block.caption.map(renderTextNode)}</figcaption>
            ) : null}
          </figure>
        )
      case 'video':
        return (
          <figure key={block.id} data-block-id={block.id} className="rt-video">
            <Video block={block} />
            <figcaption>{block.caption.map(renderTextNode)}</figcaption>
          </figure>
        )
      case 'code_block':
        return (
          <pre key={block.id} data-block-id={block.id} data-lang={block.lang} className="rt-code">
            <code>
              {block.children.map((line, lineIndex) => (
                <span key={lineIndex} className="rt-code__line" data-line={lineIndex}>
                  {renderInline(line.children)}
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
        )
      case 'toc':
        return renderToc(content, block, labels?.toc ?? 'Contents')
      case 'drug_card':
        return (
          <section key={block.id} data-block-id={block.id} className="rt-drugcard">
            <p className="rt-drugcard__title">{block.fields.generic_name}</p>
            <dl>
              {DRUG_CARD_FIELD_KEYS.filter(
                (key) => key !== 'generic_name' && block.fields[key],
              ).map((key) => (
                <div key={key} className="rt-drugcard__row" data-field={key}>
                  <dt>{fieldLabels[key]}</dt>
                  <dd>{block.fields[key]}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
    }
  }

  return (
    <div className="rt-root">
      {groupListItems(content).map((unit, index) =>
        'kind' in unit ? (
          <Fragment key={`list-${index}`}>{renderListLevel(unit.items, unit.style, 1)}</Fragment>
        ) : (
          renderBlock(unit)
        ),
      )}
    </div>
  )
}
