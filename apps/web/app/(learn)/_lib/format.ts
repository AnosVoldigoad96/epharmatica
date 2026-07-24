/**
 * Learn-surface formatting helpers (1.C).
 */

/** Zero-padded semester code for the "SEM {NN}" chips (reader spec). */
export function semesterCode(semester: number): string {
  return String(semester).padStart(2, '0')
}

/**
 * "12 Jul 2026" for the reader's UPDATED meta chip — the spec pins this
 * exact shape (day-first, short month; chip CSS uppercases it), so the
 * formatter is fixed rather than locale-derived.
 */
export function updatedDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}
