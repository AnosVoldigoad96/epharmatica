/**
 * Deterministic display for inline date chips. The SAME string feeds the
 * reader DOM, plain-text extraction, and anchor text runs — highlight
 * offsets index into renderer-visible text, so the three must never
 * diverge (M1 §5.5). Fixed English month abbreviations keep server and
 * client renders identical regardless of runtime locale.
 */

export const DATE_VALUE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/** "2026-07-24" → "Jul 24, 2026"; unparseable input echoes back verbatim. */
export function formatDateDisplay(value: string): string {
  if (!DATE_VALUE_PATTERN.test(value)) return value
  const [year, month, day] = value.split('-') as [string, string, string]
  const monthIndex = Number(month) - 1
  const monthLabel = MONTHS[monthIndex]
  if (!monthLabel) return value
  return `${monthLabel} ${Number(day)}, ${year}`
}
