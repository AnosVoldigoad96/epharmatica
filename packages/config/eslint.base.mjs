import tseslint from 'typescript-eslint'

/**
 * Shared ESLint base for every workspace.
 *
 * Encodes two load-bearing invariants (docs/rules.md §2):
 *  - I4: product code never imports the slate or @udecode packages — only
 *    @epharmatica/editor may (that package overrides this rule locally).
 *  - I2: the service-role Supabase client is imported nowhere except
 *    apps/web/lib/supabase/admin.ts (the app config scopes the allowed override).
 */
export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/.turbo/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['slate', 'slate-*', '@udecode/*'],
              message:
                'Invariant I4: editor internals are only touched inside @epharmatica/editor. Import from @epharmatica/editor instead.',
            },
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
)
