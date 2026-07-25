/**
 * user_notes.content ↔ plain text (1.D · M1-5). Notes store the STANDARD
 * block array (I9 — one rich-text serialization everywhere); v1's input
 * surface is a plain textarea, so the write side emits paragraph blocks
 * (one per line) and the read side extracts text defensively from any
 * lightweight-Plate document (marks + lists only per the M1 contract).
 * Pure module — unit-tested without React or the DOM.
 */

export type NoteParagraph = { id: string; type: 'p'; children: { text: string }[] }

function noteBlockId(): string {
  // crypto.randomUUID exists in every runtime we target (Node 22, evergreen
  // browsers); the fallback keeps tests hermetic under stripped environments.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Plain textarea text → standard paragraph-block array (one per line). */
export function textToNoteDoc(text: string): NoteParagraph[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  // Trim leading/trailing blank lines but keep interior ones (paragraph
  // breaks the author typed).
  while (lines.length > 0 && lines[0]?.trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()
  const paragraphs = lines.length > 0 ? lines : ['']
  return paragraphs.map((line) => ({
    id: noteBlockId(),
    type: 'p' as const,
    children: [{ text: line }],
  }))
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Depth-first text of one node — `text` leaves plus nested `children`. */
function nodeText(node: unknown): string {
  if (!isRecord(node)) return ''
  if (typeof node.text === 'string') return node.text
  if (Array.isArray(node.children)) return node.children.map(nodeText).join('')
  return ''
}

/**
 * Stored content jsonb → display text. Blocks join with newlines; list
 * blocks contribute one line per item. Anything malformed reads as ''
 * (defensive — the jsonb CHECK only guarantees an array).
 */
export function noteDocToText(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const lines: string[] = []
  for (const block of value) {
    if (!isRecord(block)) continue
    if ((block.type === 'ul' || block.type === 'ol') && Array.isArray(block.children)) {
      for (const item of block.children) lines.push(nodeText(item))
      continue
    }
    lines.push(nodeText(block))
  }
  return lines.join('\n').trim()
}
