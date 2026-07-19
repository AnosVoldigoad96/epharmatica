import { defineConfig, devices } from '@playwright/test'

/**
 * Phase-0 smoke suite (dev-plan 0.B / rules.md §9): landing + legal routes,
 * desktop and mobile (the system is designed at 360px first — STYLE.md §6).
 * Runs against the production build: `next build` first, then this config
 * starts `next start` itself. Phase-1 grows this into the full smoke set
 * (auth both paths, reader, anon preview gate at the network layer, AI mock).
 */
const PORT = 3111

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // 360px-first is a design contract (STYLE §6); Pixel 5 ≈ 393×851 with
      // touch + coarse pointer, which also exercises the §6.7 one-column form.
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
})
