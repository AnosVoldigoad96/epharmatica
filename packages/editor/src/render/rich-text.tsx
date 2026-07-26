import type { CSSProperties, ComponentType, ReactNode } from 'react'
import { Fragment } from 'react'

import { formatDateDisplay } from '../schema/date'
import { CALLOUT_LABELS, DRUG_CARD_FIELD_LABELS } from '../schema/labels'
import { upgradeLegacyLists } from '../schema/legacy-lists'
import type {
  Block,
  CalloutVariant,
  ColumnChildBlock,
  Content,
  DrugCardFieldKey,
  EquationBlock,
  ImageBlock,
  InlineEquationNode,
  InlineNode,
  ListBlock,
  ListItemNode,
  NestedListNode,
  NestedParagraph,
  TextNode,
  ToggleBlock,
  VideoBlock,
} from '../schema/types'
import { DRUG_CARD_FIELD_KEYS, isTextNode } from '../schema/types'

/**
 * <RichText/> — the ONE read renderer (I4). Server-component-safe and
 * dependency-free: it walks stored block JSON directly, so public reader
 * routes never ship editor code (perf budget, rules.md §9.6). Interaction
 * leaves (video facade, zoomable images) and KaTeX equation renderers are
 * injected by the app through `components` (server-side pair from
 * `@epharmatica/editor/static` on RSC routes — the katex engine never
 * enters a client graph); everything else renders as semantic HTML with stable
 * `rt-*` class hooks and `data-block-id` markers (the highlight layer's
 * DOM contract).
 *
 * DUAL-READ: v1 flat lists are upgraded to v2 containers before rendering
 * (legacy-lists.ts, keepItemIds so per-item anchors keep their DOM ids);
 * toggle contents (following blocks with deeper `indent`) group into a
 * native <details>. Both shapes render identically.
 */

export type RichTextComponents = {
  img?: ComponentType<{ block: ImageBlock }>
  video?: ComponentType<{ block: VideoBlock }>
  /**
   * KaTeX renderers. RSC surfaces inject the server-side pair from
   * `@epharmatica/editor/static` (katex.renderToString — the client gets
   * HTML + CSS only); client-side surfaces inject the lazy pair
   * (ClientEquation/ClientInlineEquation). The dependency-free default
   * shows the raw TeX source.
   */
  equation?: ComponentType<{ block: EquationBlock }>
  inlineEquation?: ComponentType<{ node: InlineEquationNode }>
}

type InlineEquationComponent = ComponentType<{ node: InlineEquationNode }>

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
  if (node.kbd) rendered = <kbd className="rt-kbd">{rendered}</kbd>
  if (node.sub) rendered = <sub>{rendered}</sub>
  if (node.sup) rendered = <sup>{rendered}</sup>
  if (node.strikethrough) rendered = <s>{rendered}</s>
  if (node.underline) rendered = <u>{rendered}</u>
  if (node.italic) rendered = <em>{rendered}</em>
  if (node.bold) rendered = <strong>{rendered}</strong>
  if (node.highlight) rendered = <mark className="rt-mark">{rendered}</mark>
  if (node.color || node.backgroundColor || node.fontSize) {
    const style: CSSProperties = {}
    if (node.color) style.color = node.color
    if (node.backgroundColor) style.backgroundColor = node.backgroundColor
    if (node.fontSize) style.fontSize = node.fontSize
    rendered = <span style={style}>{rendered}</span>
  }
  return <Fragment key={key}>{rendered}</Fragment>
}

/** Dependency-free fallbacks: raw TeX source (surfaces without an injected
 * KaTeX renderer stay readable — and still searchable/copyable). */
function DefaultInlineEquation({ node }: { node: InlineEquationNode }) {
  return <code>{node.texExpression}</code>
}

function DefaultEquation({ block }: { block: EquationBlock }) {
  return <code>{block.texExpression}</code>
}

function renderInline(nodes: InlineNode[], InlineEquation: InlineEquationComponent): ReactNode {
  return nodes.map((node, index) => {
    if (isTextNode(node)) return renderTextNode(node, index)
    if (node.type === 'date') {
      return (
        <time key={index} className="rt-date" dateTime={node.date}>
          {formatDateDisplay(node.date)}
        </time>
      )
    }
    if (node.type === 'inline_equation') {
      return (
        <span key={index} className="rt-inline-equation">
          <InlineEquation node={node} />
        </span>
      )
    }
    return (
      <a key={index} className="rt-link" href={node.url}>
        {node.children.map(renderTextNode)}
      </a>
    )
  })
}

/** align/lineHeight → inline style ('left'/'right' stored literally per
 * Plate convention; everything else in the reader stays logical/RTL-safe). */
function proseStyle(block: { align?: string; lineHeight?: number }): CSSProperties | undefined {
  if (!block.align && !block.lineHeight) return undefined
  const style: CSSProperties = {}
  if (block.align) style.textAlign = block.align as CSSProperties['textAlign']
  if (block.lineHeight) style.lineHeight = block.lineHeight
  return style
}

function renderNestedParagraphs(
  paragraphs: NestedParagraph[],
  InlineEquation: InlineEquationComponent,
): ReactNode {
  return paragraphs.map((paragraph, index) => (
    <p key={index} style={proseStyle(paragraph)}>
      {renderInline(paragraph.children, InlineEquation)}
    </p>
  ))
}

/* ------------------------------------------------------- toggle grouping */

/** Top-level render unit: a plain block, or a toggle + its indented body. */
type ToggleUnit = { kind: 'toggle'; toggle: ToggleBlock; body: RenderUnit[] }
type RenderUnit = { kind: 'block'; block: Block } | ToggleUnit

/**
 * Group toggle contents: after a toggle, every following top-level block
 * with `indent` greater than the toggle's belongs to its body (nested
 * toggles recurse). Mirrors Plate's toggle indent model.
 */
function groupToggles(blocks: Block[]): RenderUnit[] {
  const units: RenderUnit[] = []
  let index = 0
  const takeBody = (base: number): RenderUnit[] => {
    const body: RenderUnit[] = []
    while (index < blocks.length && ((blocks[index] as Block).indent ?? 0) > base) {
      const child = blocks[index] as Block
      index += 1
      if (child.type === 'toggle') {
        body.push({ kind: 'toggle', toggle: child, body: takeBody(child.indent ?? 0) })
      } else {
        body.push({ kind: 'block', block: child })
      }
    }
    return body
  }
  while (index < blocks.length) {
    const block = blocks[index] as Block
    index += 1
    if (block.type === 'toggle') {
      units.push({ kind: 'toggle', toggle: block, body: takeBody(block.indent ?? 0) })
    } else {
      units.push({ kind: 'block', block })
    }
  }
  return units
}

/* ------------------------------------------------------------------ lists */

function renderList(
  list: ListBlock | NestedListNode,
  InlineEquation: InlineEquationComponent,
  blockId?: string,
): ReactNode {
  const ListTag = list.type === 'ol' ? 'ol' : 'ul'
  return (
    <ListTag className="rt-list" data-block-id={blockId}>
      {list.children.map((item: ListItemNode, index: number) => {
        const [lic, nested] = item.children
        return (
          <li key={index} data-block-id={item.id}>
            {renderInline(lic.children, InlineEquation)}
            {nested ? renderList(nested, InlineEquation) : null}
          </li>
        )
      })}
    </ListTag>
  )
}

/** TOC lists TOP-LEVEL headings only — column-hosted headings are id-less
 * (no anchor target), so they never join the outline. `id` is undefined
 * for a toc block rendered inside a column. */
function renderToc(
  content: Content,
  id: string | undefined,
  tocLabel: string,
  InlineEquation: InlineEquationComponent,
): ReactNode {
  const headings = content.filter((candidate) => candidate.type === 'h2' || candidate.type === 'h3')
  return (
    <nav data-block-id={id} className="rt-toc" aria-label={tocLabel}>
      <ol>
        {headings.map((heading) =>
          heading.type === 'h2' || heading.type === 'h3' ? (
            <li key={heading.id} className={heading.type === 'h3' ? 'rt-toc__sub' : undefined}>
              <a href={`#h-${heading.id}`}>{renderInline(heading.children, InlineEquation)}</a>
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
  const Equation = components?.equation ?? DefaultEquation
  const InlineEq = components?.inlineEquation ?? DefaultInlineEquation

  // Dual-read: upgrade v1 flat lists (keeping per-item anchor ids), then
  // render the ONE canonical shape.
  const upgraded = upgradeLegacyLists(content, { keepItemIds: true })

  /**
   * `baseIndent` is the indentation the surrounding context already
   * accounts for (a toggle body resets it) — blocks indented deeper than
   * that get a logical-margin nudge per extra level.
   */
  const renderBlock = (
    block: Block | ColumnChildBlock,
    baseIndent: number,
    key: number | string,
  ): ReactNode => {
    const id = 'id' in block ? (block as Block).id : undefined
    const extraIndent = Math.max(0, ('indent' in block ? (block.indent ?? 0) : 0) - baseIndent)
    const indentStyle: CSSProperties | undefined =
      extraIndent > 0 ? { marginInlineStart: `${extraIndent * 1.5}rem` } : undefined
    const withIndent = (style?: CSSProperties): CSSProperties | undefined =>
      indentStyle || style ? { ...style, ...indentStyle } : undefined

    switch (block.type) {
      case 'p':
        return (
          <p key={key} data-block-id={id} style={withIndent(proseStyle(block))}>
            {renderInline(block.children, InlineEq)}
          </p>
        )
      case 'h2':
        return (
          <h2
            key={key}
            id={id ? `h-${id}` : undefined}
            data-block-id={id}
            style={withIndent(proseStyle(block))}
          >
            {renderInline(block.children, InlineEq)}
          </h2>
        )
      case 'h3':
        return (
          <h3
            key={key}
            id={id ? `h-${id}` : undefined}
            data-block-id={id}
            style={withIndent(proseStyle(block))}
          >
            {renderInline(block.children, InlineEq)}
          </h3>
        )
      case 'blockquote':
        return (
          <blockquote key={key} data-block-id={id} style={withIndent(proseStyle(block))}>
            {renderInline(block.children, InlineEq)}
          </blockquote>
        )
      case 'ul':
      case 'ol':
        return (
          <Fragment key={key}>
            {indentStyle ? (
              <div style={indentStyle}>{renderList(block as ListBlock, InlineEq, id)}</div>
            ) : (
              renderList(block as ListBlock, InlineEq, id)
            )}
          </Fragment>
        )
      case 'hr':
        return <hr key={key} data-block-id={id} className="rt-hr" style={indentStyle} />
      case 'equation':
        // Display math — the wrapper owns the anchor id + overflow scroll;
        // the injected component owns the KaTeX markup.
        return (
          <div key={key} data-block-id={id} className="rt-equation" style={indentStyle}>
            <Equation block={block as EquationBlock} />
          </div>
        )
      case 'column_group':
        return (
          <div key={key} data-block-id={id} className="rt-columns" style={indentStyle}>
            {block.children.map((column, columnIndex) => (
              <div
                key={columnIndex}
                className="rt-columns__col"
                style={column.width ? { flexBasis: column.width } : undefined}
              >
                {column.children.map((child, childIndex) => renderBlock(child, 0, childIndex))}
              </div>
            ))}
          </div>
        )
      case 'callout':
        return (
          <aside
            key={key}
            data-block-id={id}
            className={`rt-callout rt-callout--${block.variant}`}
            style={indentStyle}
          >
            <p className="rt-callout__label">{calloutLabels[block.variant]}</p>
            {renderNestedParagraphs(block.children, InlineEq)}
          </aside>
        )
      case 'table':
        return (
          <div key={key} data-block-id={id} className="rt-table-wrap" style={indentStyle}>
            <table className="rt-table">
              <tbody>
                {block.children.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.children.map((cell, colIndex) =>
                      cell.type === 'th' ? (
                        <th
                          key={colIndex}
                          scope={rowIndex === 0 ? 'col' : 'row'}
                          colSpan={cell.colSpan}
                          rowSpan={cell.rowSpan}
                        >
                          {renderNestedParagraphs(cell.children, InlineEq)}
                        </th>
                      ) : (
                        <td key={colIndex} colSpan={cell.colSpan} rowSpan={cell.rowSpan}>
                          {renderNestedParagraphs(cell.children, InlineEq)}
                        </td>
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
          <figure key={key} data-block-id={id} className="rt-figure" style={indentStyle}>
            <Image block={block as ImageBlock} />
            {block.caption && block.caption.length > 0 ? (
              <figcaption>{block.caption.map(renderTextNode)}</figcaption>
            ) : null}
          </figure>
        )
      case 'video':
        return (
          <figure key={key} data-block-id={id} className="rt-video" style={indentStyle}>
            <Video block={block as VideoBlock} />
            <figcaption>{block.caption.map(renderTextNode)}</figcaption>
          </figure>
        )
      case 'code_block':
        return (
          <pre
            key={key}
            data-block-id={id}
            data-lang={block.lang}
            className="rt-code"
            style={indentStyle}
          >
            <code>
              {block.children.map((line, lineIndex) => (
                <span key={lineIndex} className="rt-code__line" data-line={lineIndex}>
                  {renderInline(line.children, InlineEq)}
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
        )
      case 'toc':
        return (
          <Fragment key={key}>
            {renderToc(upgraded, id, labels?.toc ?? 'Contents', InlineEq)}
          </Fragment>
        )
      case 'drug_card':
        return (
          <section key={key} data-block-id={id} className="rt-drugcard" style={indentStyle}>
            <p className="rt-drugcard__title">{block.fields.generic_name}</p>
            <dl>
              {DRUG_CARD_FIELD_KEYS.filter(
                (fieldKey) => fieldKey !== 'generic_name' && block.fields[fieldKey],
              ).map((fieldKey) => (
                <div key={fieldKey} className="rt-drugcard__row" data-field={fieldKey}>
                  <dt>{fieldLabels[fieldKey]}</dt>
                  <dd>{block.fields[fieldKey]}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      case 'toggle':
        // Reached only for a toggle stripped of its body by preview slicing
        // (groupToggles handles the normal path) — render just the summary.
        return renderToggleUnit(
          { kind: 'toggle', toggle: block as ToggleBlock, body: [] },
          baseIndent,
          key,
        )
    }
  }

  const renderToggleUnit = (
    unit: ToggleUnit,
    baseIndent: number,
    key: number | string,
  ): ReactNode => {
    const toggle = unit.toggle
    const extraIndent = Math.max(0, (toggle.indent ?? 0) - baseIndent)
    return (
      <details
        key={key}
        data-block-id={toggle.id}
        className="rt-toggle"
        style={extraIndent > 0 ? { marginInlineStart: `${extraIndent * 1.5}rem` } : undefined}
      >
        <summary>{renderInline(toggle.children, InlineEq)}</summary>
        <div className="rt-toggle__body">{renderUnits(unit.body, (toggle.indent ?? 0) + 1)}</div>
      </details>
    )
  }

  const renderUnits = (units: RenderUnit[], baseIndent: number): ReactNode =>
    units.map((unit, index) =>
      unit.kind === 'toggle'
        ? renderToggleUnit(unit, baseIndent, index)
        : renderBlock(unit.block, baseIndent, unit.block.id),
    )

  return <div className="rt-root">{renderUnits(groupToggles(upgraded), 0)}</div>
}
