import { defineConfig } from 'vitest/config'

/**
 * Vitest for apps/web — unit tests for pure lib modules only (rules.md §9:
 * Vitest sits at the base of the pyramid; Playwright owns e2e). Scoped to
 * lib/**\/*.test.ts so the e2e/*.spec.ts Playwright suite is never picked up.
 */
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
