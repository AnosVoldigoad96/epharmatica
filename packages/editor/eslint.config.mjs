import base from '@epharmatica/config/eslint.base'

/**
 * packages/editor ESLint config: the ONE workspace where invariant I4 is
 * lifted — this package is the blast-shield, so slate/platejs imports are
 * legal here (the Plate editing surface lands with 1.B-3). The I2
 * service-role restriction stays in force.
 */
export default [
  ...base,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*supabase/admin', '**/supabase/admin'],
              message:
                'Invariant I2: the service-role client is only imported by trusted server modules (see apps/web eslint config for the allowed scope).',
            },
          ],
        },
      ],
    },
  },
]
