/**
 * Minimal className joiner for the vendored plate-ui components (which call
 * shadcn's `cn`). No clsx/tailwind-merge: the vendored class lists never
 * conflict, they only concatenate static strings with optional conditionals.
 */
export type ClassValue = string | false | null | undefined

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ')
}
