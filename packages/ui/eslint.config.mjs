import base from '@epharmatica/config/eslint.base'

/**
 * packages/ui ESLint config: the shared base only (I2/I4
 * no-restricted-imports). No framework plugins — this package is raw React
 * source transpiled by the consuming app.
 */
export default [...base]
