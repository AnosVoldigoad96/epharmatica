import { createPlateEditor } from 'platejs/react'
import { describe, expect, it } from 'vitest'

import type { Content } from '../schema/types'
import { editorKit } from './editor-kit'
import { fromEditorValue, toEditorValue } from './serialize'

/**
 * Headless kit tests: resolve the full plugin kit and drive the editor
 * through transforms (no DOM). Proves the v53 wiring — slash, dnd,
 * trailing block, markdown input rules — resolves and that everything the
 * kit produces survives the serializer's whitelist.
 */

const p = (id: string, text: string) => ({
  id,
  type: 'p' as const,
  children: [{ text }],
})

const makeEditor = (value: Content) =>
  createPlateEditor({ plugins: editorKit, value: toEditorValue(value) })

describe('editorKit (plugin resolution)', () => {
  it('resolves slash, dnd, trailing-block, and markdown input rules', () => {
    const editor = makeEditor([p('a', '')])
    expect(editor.plugins.slash_command).toBeDefined()
    expect(editor.plugins.slash_input).toBeDefined()
    expect(editor.plugins.dnd).toBeDefined()
    expect(editor.plugins.trailingBlock).toBeDefined()
    expect(editor.plugins.epharm_markdown).toBeDefined()
    expect(editor.meta.inputRules.insertText.all.length).toBeGreaterThan(0)
  })
})

describe('markdown autoformat (input rules)', () => {
  const typeAtStart = (editor: ReturnType<typeof makeEditor>, text: string) => {
    editor.tf.select({ path: [0, 0], offset: 0 })
    for (const char of text) editor.tf.insertText(char)
  }

  it('turns "# " into h2 and "## " into h3', () => {
    const h2Editor = makeEditor([p('a', '')])
    typeAtStart(h2Editor, '# ')
    expect(h2Editor.children[0]?.type).toBe('h2')

    const h3Editor = makeEditor([p('a', '')])
    typeAtStart(h3Editor, '## ')
    expect(h3Editor.children[0]?.type).toBe('h3')
  })

  it('turns "> " into a blockquote that serializes to flat inline children', () => {
    const editor = makeEditor([p('a', '')])
    typeAtStart(editor, '> ')
    // Editor-time, the v53 blockquote plugin wraps children into paragraphs;
    // the serializer flattens them back to the schema's inline children.
    expect(editor.children[0]?.type).toBe('blockquote')
    const result = fromEditorValue(editor.children)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.content[0]).toEqual({
        id: 'a',
        type: 'blockquote',
        children: [{ text: '' }],
      })
    }
  })

  it('turns "- " and "1. " into flat list paragraphs', () => {
    const bullets = makeEditor([p('a', '')])
    typeAtStart(bullets, '- ')
    expect(bullets.children[0]?.type).toBe('p')
    expect((bullets.children[0] as { listStyleType?: string }).listStyleType).toBe('disc')

    const numbers = makeEditor([p('a', '')])
    typeAtStart(numbers, '1. ')
    expect(numbers.children[0]?.type).toBe('p')
    expect((numbers.children[0] as { listStyleType?: string }).listStyleType).toBe('decimal')
  })

  it('turns ``` into a code block', () => {
    const editor = makeEditor([p('a', '')])
    typeAtStart(editor, '```')
    expect(editor.children[0]?.type).toBe('code_block')
    expect((editor.children[0]?.children[0] as { type?: string }).type).toBe('code_line')
  })

  it('applies **bold**, *italic*, and `code` marks', () => {
    const editor = makeEditor([p('a', '')])
    typeAtStart(editor, '**strong** *slanted* `mono`')
    const texts = editor.children[0]?.children as Array<Record<string, unknown>>
    expect(texts.some((node) => node.bold === true && node.text === 'strong')).toBe(true)
    expect(texts.some((node) => node.italic === true && node.text === 'slanted')).toBe(true)
    expect(texts.some((node) => node.code === true && node.text === 'mono')).toBe(true)
  })

  it('does NOT convert blocks inside callout bodies or table cells', () => {
    const editor = makeEditor([
      {
        id: 'co',
        type: 'callout',
        variant: 'definition',
        children: [{ type: 'p', children: [{ text: '' }] }],
      },
    ])
    editor.tf.select({ path: [0, 0, 0], offset: 0 })
    editor.tf.insertText('#')
    editor.tf.insertText(' ')
    const nested = editor.children[0]?.children[0] as { type?: string }
    expect(nested.type).toBe('p')
  })

  it('autoformat output round-trips the serializer clean', () => {
    const editor = makeEditor([p('a', '')])
    typeAtStart(editor, '- item **one**')
    const result = fromEditorValue(editor.children)
    expect(result.ok).toBe(true)
  })
})

describe('slash command trigger', () => {
  it('inserts an inline slash_input element on "/"', () => {
    const editor = makeEditor([p('a', '')])
    editor.tf.select({ path: [0, 0], offset: 0 })
    editor.tf.insertText('/')
    const inline = editor.children[0]?.children.find(
      (node) => (node as { type?: string }).type === 'slash_input',
    )
    expect(inline).toBeDefined()
  })

  it('does not trigger inside code blocks', () => {
    const editor = makeEditor([
      {
        id: 'code',
        type: 'code_block',
        children: [{ type: 'code_line', children: [{ text: '' }] }],
      },
    ])
    editor.tf.select({ path: [0, 0, 0], offset: 0 })
    editor.tf.insertText('/')
    const line = editor.children[0]?.children[0] as { children: Array<Record<string, unknown>> }
    expect(line.children.every((node) => node.type === undefined)).toBe(true)
    expect(line.children[0]?.text).toBe('/')
  })

  it('an open slash_input never survives the save path', () => {
    const editor = makeEditor([p('a', 'x')])
    editor.tf.select({ path: [0, 0], offset: 1 })
    editor.tf.insertText(' ')
    editor.tf.insertText('/')
    const result = fromEditorValue(editor.children)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(JSON.stringify(result.content)).not.toContain('slash_input')
    }
  })
})

describe('trailing block', () => {
  it('keeps an empty trailing paragraph after a non-paragraph last block', () => {
    const editor = makeEditor([
      {
        id: 'code',
        type: 'code_block',
        children: [{ type: 'code_line', children: [{ text: 'x' }] }],
      },
    ])
    // Trailing-block is a normalizer: run a normalization pass.
    editor.tf.normalize({ force: true })
    const last = editor.children.at(-1)
    expect(last?.type).toBe('p')
  })
})
