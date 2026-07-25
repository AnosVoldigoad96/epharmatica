import katex from 'katex'

import { READER_KATEX_OPTIONS } from './equation-options'

/**
 * The ONE reader-side katex.renderToString call. Two consumption modes:
 *
 *  - equation-static.tsx imports it STATICALLY — server bundles only (the
 *    `./static` subpath never enters a client graph);
 *  - equation-client.tsx imports it DYNAMICALLY — the bundler splits this
 *    module (katex engine included) into an on-demand chunk, so shared
 *    client chunks contain no katex code, not even this call site.
 */
export function renderEquationHtml(texExpression: string, displayMode: boolean): string {
  return katex.renderToString(texExpression, { ...READER_KATEX_OPTIONS, displayMode })
}
