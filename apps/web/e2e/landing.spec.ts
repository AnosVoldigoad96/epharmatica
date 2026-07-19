import { expect, test } from '@playwright/test'

/**
 * Landing smoke — mockup 2a. Copy assertions use the exact en.json strings;
 * if the catalog changes these fail loudly, which is the point.
 */
test.describe('landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('renders the hero with exactly one h1', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      "Study material that's easier than the textbook.",
    )
  })

  test('hero demo panel shows live primitives', async ({ page }) => {
    await expect(page.getByText('LIVE FROM THE SYSTEM — NOT A SCREENSHOT')).toBeVisible()
    await expect(page.getByText('Renal handling')).toBeVisible()
    await expect(page.getByText('COMPLETED · 12 JUL')).toBeVisible()
    await expect(page.getByText('CLINICAL PEARL')).toBeVisible()
  })

  test('all six module sections are present', async ({ page }) => {
    for (const id of ['learning', 'ai-study-tools', 'community', 'blog', 'jobs', 'resume']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1)
    }
    // The four unreleased modules each carry exactly one Coming Soon chip
    // (the YouTube facade captions also say COMING SOON — scoped on purpose).
    for (const id of ['community', 'blog', 'jobs', 'resume']) {
      await expect(page.locator(`#${id}`).getByText('COMING SOON')).toHaveCount(1)
    }
  })

  test('waitlist band has the S12 form', async ({ page }) => {
    const band = page.locator('#waitlist')
    await expect(band.getByText('JOIN THE WAITLIST')).toBeVisible()
    await expect(band.getByRole('textbox')).toBeVisible()
    await expect(band.locator('select')).toHaveCount(2)
    await expect(band.getByRole('button', { name: 'Join waitlist' })).toBeVisible()
  })

  test('waitlist submit never crashes — errors are announced', async ({ page }) => {
    // Without a reachable database the server action must degrade to a
    // friendly, screen-reader-announced error — never a crash or silence.
    const band = page.locator('#waitlist')
    await band.getByRole('textbox').fill('smoke@example.com')
    await band.getByRole('button', { name: 'Join waitlist' }).click()
    const alert = band.getByRole('alert')
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await expect(alert).not.toBeEmpty()
  })

  test('footer carries the legal link line', async ({ page }) => {
    const footer = page.getByRole('contentinfo')
    for (const name of [
      'About',
      'Contact',
      'Privacy Policy',
      'Terms of Service',
      'Content Policy',
      'Medical Disclaimer',
    ]) {
      await expect(footer.getByRole('link', { name })).toBeVisible()
    }
  })
})

test.describe('hero composition (S4)', () => {
  test('statement and demo panel arrange per viewport', async ({ page }, testInfo) => {
    await page.goto('/')
    const h1 = page.getByRole('heading', { level: 1 })
    const demoLabel = page.getByText('LIVE FROM THE SYSTEM — NOT A SCREENSHOT')
    const h1Box = (await h1.boundingBox())!
    const demoBox = (await demoLabel.boundingBox())!
    if (testInfo.project.name === 'mobile') {
      // Below md the hero stacks statement-first (STYLE §6 / S4).
      expect(demoBox.y).toBeGreaterThan(h1Box.y + h1Box.height)
    } else {
      // Desktop: side-by-side split — the demo panel starts beside the
      // statement, not below it.
      expect(demoBox.x).toBeGreaterThan(h1Box.x + h1Box.width)
    }
  })
})
