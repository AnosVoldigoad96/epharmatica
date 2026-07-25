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
 * the client itself; the others are the only surfaces allowed to use it
 * (auth service ops, table-backed rate limiter, audit writer — all
 * `server-only` — plus the CRON_SECRET-guarded audit-export route).
 * Everything else hits `no-restricted-imports`. Extending this list is a
 * reviewed decision, not a convenience.
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
      // Reviewed addition (1.B-5b): the yearly audit-export cron reads
      // audit_log and calls prune_audit_log on the service role (M4 §9 D-b).
      'app/api/cron/audit-export/route.ts',
      // Reviewed addition (024): the daily trash-purge cron calls
      // purge_content_trash on the service role (CRON_SECRET-guarded).
      'app/api/cron/content-purge/route.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]

export default config
