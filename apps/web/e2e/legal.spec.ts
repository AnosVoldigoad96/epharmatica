import { expect, test } from '@playwright/test'

/**
 * Legal/info routes smoke (dev-plan 0.E): every policy-promised page resolves
 * and renders real content inside the reading column.
 */
const PAGES = [
  { path: '/terms', heading: /terms of service/i },
  { path: '/privacy', heading: /privacy policy/i },
  { path: '/content-policy', heading: /content policy/i },
  { path: '/medical-disclaimer', heading: /medical disclaimer/i },
  { path: '/about', heading: /./ },
  { path: '/contact', heading: /./ },
] as const

for (const { path, heading } of PAGES) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading)
  })
}

test('legal drafts still carry their DRAFT marker until go-live', async ({ page }) => {
  // dev-plan 0.E: bracketed fields + DRAFT headers are removed before launch.
  // Until then their presence is deliberate — this documents it. When the
  // drafts are finalized, invert this assertion.
  await page.goto('/terms')
  await expect(page.getByText(/DRAFT — pending review/i).first()).toBeVisible()
})
