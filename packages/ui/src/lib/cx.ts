import { twMerge } from 'tailwind-merge'

/**
 * Class joiner with Tailwind conflict resolution: a caller's `className`
 * override (e.g. BlisterCell `p-3.5`) must beat a primitive's base class
 * (`p-4.5`) regardless of stylesheet order, so the later argument wins.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return twMerge(parts.filter(Boolean).join(' '))
}
