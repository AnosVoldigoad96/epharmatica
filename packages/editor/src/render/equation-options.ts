import type { KatexOptions } from 'katex'

/**
 * The ONE reader-side KaTeX option set, shared by the server renderer
 * (equation-static.tsx) and the lazy client renderer (equation-client.tsx).
 * This module imports katex TYPES only — it is safe in any bundle graph;
 * the JS engine itself is imported exclusively by those two renderers.
 *
 *  - `output: 'html'` — HTML + CSS only, no MathML branch (the wrappers
 *    carry the accessible TeX source as an aria-label instead);
 *  - `throwOnError: false` — malformed TeX renders as visible red source,
 *    never a crash;
 *  - `trust: false` — no \href/\htmlClass escape hatches from stored
 *    content.
 */
export const READER_KATEX_OPTIONS = {
  output: 'html',
  throwOnError: false,
  trust: false,
} satisfies KatexOptions
