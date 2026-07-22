import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import base from '@epharmatica/config/eslint.base'

/**
 * apps/web ESLint config: shared base (I2/I4 no-restricted-imports) + Next
 * rules. eslint-config-next v16 ships flat configs — imported directly, no
 * FlatCompat (wrapping them in the legacy loader crashes it).
 *
 * The override below IS the invariant-I2 mechanism: this allowlist is the
 * complete set of trusted service-role modules. lib/supabase/admin.ts is
 * the client itself; the other three are the only surfaces allowed to use
 * it (auth service ops, table-backed rate limiter, audit writer — all
 * `server-only`). Everything else hits `no-restricted-imports`. Extending
 * this list is a reviewed decision, not a convenience.
 */
const config = [
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
  ...base,
  ...nextVitals,
  ...nextTs,
  {
    files: [
      'lib/supabase/admin.ts',
      'lib/auth/admin-ops.ts',
      'lib/security/rate-limit.ts',
      'lib/observability/audit.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]

export default config
