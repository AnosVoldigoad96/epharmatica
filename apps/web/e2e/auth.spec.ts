import { expect, test } from '@playwright/test'

/**
 * Auth surfaces smoke (dev-plan 1.A · M2 §4.1–§4.4). Like the landing suite,
 * everything here passes with NO Supabase/Turnstile env: forms render, gated
 * routes redirect (queries degrade to "no session"), and submits fail
 * friendly — errors are announced, never thrown. Live-stack acceptance
 * (verification emails, OAuth, auto-link matrix) runs on the VPS per
 * docs/runbooks/auth-deploy.md §5.
 *
 * Copy assertions use exact en.json strings on purpose.
 */

test.describe('sign-up', () => {
  test('renders the full form in wireframe order with the verbatim notices', async ({ page }) => {
    await page.goto('/auth/sign-up')

    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()

    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByLabel('Username')).toBeVisible()
    await expect(page.getByLabel('Display name')).toBeVisible()

    // M2 §4.4 — the standing permanent-username line, verbatim.
    await expect(page.getByText("Your username is permanent and can't be changed.")).toBeVisible()

    // 13+ affirmation with Terms/Privacy links (securities.md §6 age gate).
    const ageRow = page.getByText(/I'm 13 or older/)
    await expect(ageRow).toBeVisible()
    await expect(page.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
    await expect(page.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    )

    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible()
  })

  test('submit never crashes without a backend — errors are announced', async ({ page }) => {
    await page.goto('/auth/sign-up')

    await page.getByLabel('Email').fill('probe@example.com')
    // Multi-word + digits so the client zxcvbn gate (score ≥ 2) passes and the
    // submit reaches the server action, which fails friendly with no env.
    await page.getByLabel('Password').fill('plum-torch-49-meadow')
    await page.getByLabel('Username').fill('e2e-probe-user')
    await page.getByLabel('Display name').fill('Probe User')
    // The 13+ row is a wrapping label around an sr-only input — click the
    // visible row like a user would; .check() can't reach the clipped input.
    await page.getByText(/I'm 13 or older/).click()
    await expect(page.getByRole('checkbox')).toBeChecked()
    await page.getByRole('button', { name: 'Create account' }).click()

    // Lazy zxcvbn load + server action round-trip — generous timeout. Filter
    // to non-empty alerts: Next's route announcer is an empty role=alert too.
    await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toBeVisible({
      timeout: 15_000,
    })
  })
})

test.describe('sign-in', () => {
  test('renders with Google, forgot-password, and the create-account cross-link', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in')

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Forgot password' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible()
  })

  test('renders the verbatim signed-out-everywhere notice', async ({ page }) => {
    await page.goto('/auth/sign-in?notice=signed-out')
    await expect(page.getByRole('status')).toHaveText("You've been signed out on every device.")
  })

  test('renders the verbatim blocked-auto-link notice (M2-4)', async ({ page }) => {
    await page.goto('/auth/sign-in?notice=link-blocked')
    await expect(page.getByRole('status')).toHaveText(
      "An account with this email exists but isn't verified. Verify it first, then sign in with Google to connect them.",
    )
  })
})

test.describe('password reset', () => {
  test('forgot-password renders', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    await expect(page.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a reset link' })).toBeVisible()
  })

  test('reset-password without a recovery session lands on forgot-password', async ({ page }) => {
    await page.goto('/auth/reset-password')
    await expect(page).toHaveURL(/\/auth\/forgot-password/)
  })
})

test.describe('gates', () => {
  test('the OAuth completion step requires a session', async ({ page }) => {
    await page.goto('/auth/complete')
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })

  test('settings are gated behind sign-in and carry next (M2 §4.6)', async ({ page }) => {
    await page.goto('/settings/profile')
    await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fsettings%2Fprofile/)
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
  })
})

/**
 * Acceptance §11.6 — "Sign out everywhere" revokes a second live device within
 * seconds. Needs a reachable Supabase stack and a seeded, verified account, so
 * it only runs when E2E_LIVE_STACK + E2E_TEST_EMAIL + E2E_TEST_PASSWORD are set
 * (the VPS acceptance run per docs/runbooks/auth-deploy.md §5). Skipped in the
 * default no-backend CI, where sign-in can't complete.
 */
const LIVE = process.env.E2E_LIVE_STACK === '1'
const testEmail = process.env.E2E_TEST_EMAIL
const testPassword = process.env.E2E_TEST_PASSWORD

test.describe('sign out everywhere (live stack)', () => {
  test.skip(!LIVE || !testEmail || !testPassword, 'requires E2E_LIVE_STACK + test credentials')

  test('revokes a second live device within seconds (M2-3 · §11.6)', async ({ browser }) => {
    const signIn = async (page: import('@playwright/test').Page) => {
      await page.goto('/auth/sign-in')
      await page.getByLabel('Email').fill(testEmail as string)
      await page.getByLabel('Password').fill(testPassword as string)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).not.toHaveURL(/\/auth\/sign-in/, { timeout: 15_000 })
    }

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    try {
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()
      await signIn(pageA)
      await signIn(pageB)

      // Device B is live: settings loads without a redirect.
      await pageB.goto('/settings/profile')
      await expect(pageB).toHaveURL(/\/settings\/profile/)

      // Device A signs out everywhere.
      await pageA.goto('/settings/sessions')
      await pageA.getByRole('button', { name: 'Sign out everywhere' }).click()
      await expect(pageA).toHaveURL(/\/auth\/sign-in/, { timeout: 15_000 })

      // Device B's session is revoked within seconds — settings now redirects.
      await expect(async () => {
        await pageB.goto('/settings/profile')
        await expect(pageB).toHaveURL(/\/auth\/sign-in/)
      }).toPass({ timeout: 15_000 })
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
