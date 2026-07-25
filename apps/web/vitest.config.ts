import { defineConfig } from 'vitest/config'

/**
 * Vitest for apps/web — unit tests for pure modules only (rules.md §9:
 * Vitest sits at the base of the pyramid; Playwright owns e2e). Scoped to
 * lib/** and features/** *.test.ts so the e2e/*.spec.ts Playwright suite is
 * never picked up. Default environment is node; the study layer's
 * DOM-mapping tests opt into jsdom per-file via @vitest-environment.
 */
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'features/**/*.test.ts'],
  },
})
