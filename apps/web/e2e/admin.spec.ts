import { expect, test } from '@playwright/test'

/**
 * /admin gate smoke (M4 §4 · dev-plan 1.B), verified at the network layer.
 * The final URL depends on which gate layer fires: with Supabase env the
 * proxy (layer 1) sends anon to /auth/sign-in?next=…; env-less the layout
 * gate (layer 2) sends them home. Either way the security property is the
 * same and is what we assert: an anonymous visitor NEVER lands under
 * /admin and the shell never renders. Staff-role acceptance runs on the
 * VPS checks (runbook), not here.
 */
test.describe('/admin gate', () => {
  test('anonymous visitor never sees the admin shell', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).not.toHaveURL(/\/admin/)
    await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0)
  })

  test('nested admin routes are gated the same way', async ({ page }) => {
    await page.goto('/admin/content')
    await expect(page).not.toHaveURL(/\/admin/)
  })

  test('the /admin response is a redirect, not a rendered page', async ({ request }) => {
    const response = await request.get('/admin', { maxRedirects: 0 })
    expect([302, 303, 307, 308]).toContain(response.status())
  })
})
