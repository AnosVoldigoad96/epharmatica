/**
 * Sentinel-split for search snippets (1.C-3 · M1 §5.9). The
 * search_published RPC's ts_headline wraps hits in NON-HTML sentinel
 * markers ([[[ and ]]]) — this splits on them so the page renders <mark>
 * itself; database output never reaches dangerouslySetInnerHTML.
 *
 * Pure module (no server-only import) so the Vitest suite can exercise it.
 */

const START = '[[['
const END = ']]]'

export type SnippetPart = { text: string; hit: boolean }

/**
 * Splits a sentinel-marked snippet into ordered parts. Defensive on
 * malformed input: an unclosed start marker renders its remainder as plain
 * text (marker dropped), and a stray end marker passes through as text.
 */
export function splitSnippet(snippet: string): SnippetPart[] {
  const parts: SnippetPart[] = []
  let rest = snippet
  while (rest.length > 0) {
    const start = rest.indexOf(START)
    if (start === -1) {
      parts.push({ text: rest, hit: false })
      break
    }
    if (start > 0) parts.push({ text: rest.slice(0, start), hit: false })
    const afterStart = rest.slice(start + START.length)
    const end = afterStart.indexOf(END)
    if (end === -1) {
      // Unclosed marker — treat the remainder as plain text, never a hit.
      if (afterStart.length > 0) parts.push({ text: afterStart, hit: false })
      break
    }
    if (end > 0) parts.push({ text: afterStart.slice(0, end), hit: true })
    rest = afterStart.slice(end + END.length)
  }
  return parts
}
