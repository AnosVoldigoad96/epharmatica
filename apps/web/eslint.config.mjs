import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import base from '@epharmatica/config/eslint.base'

/**
 * apps/web ESLint config: shared base (I2/I4 no-restricted-imports) + Next
 * rules. eslint-config-next v16 ships flat configs — imported directly, no
 * FlatCompat (wrapping them in the legacy loader crashes it).
 * The single permitted override: lib/supabase/admin.ts IS the service-role
 * module (invariant I2) — the import restriction is lifted only there.
 */
const config = [
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  ...base,
  ...nextVitals,
  ...nextTs,
  {
    files: ['lib/supabase/admin.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]

export default config
