/**
 * Icon discipline (STYLE.md §10): lucide, 20px grid, 1.5px stroke,
 * square caps + miter joins. Presentation attributes set on the <svg>
 * root inherit to every child path, so passing them as props is enough.
 */
export const iconProps = {
  size: 20,
  strokeWidth: 1.5,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
  'aria-hidden': true,
} as const
