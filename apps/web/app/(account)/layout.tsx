import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { fromStoredPrefs } from '@epharmatica/database'
import { ToastProvider } from '@epharmatica/ui'
import { ThemeSync } from '@/features/account/components/theme-sync'
import { VerifyEmailBanner } from '@/features/account/components/verify-email-banner'
import { getOwnProfile, getSessionUser } from '@/features/account/queries'
import { mfaStepUpRequired } from '@/lib/auth/mfa'
import { Topnav } from './_components/topnav'

/*
 * Authed account shell (wireframes §5 · M2 §4.2 completion gate · dev-plan
 * 1.A). Requires a session AND a completed profile: no session → sign-in, a
 * session without a profile row → the OAuth completion step (the resumable
 * pending state) — both carrying the settings landing page as `next`. Then:
 * topnav, verify-email banner while GoTrue hasn't confirmed the address,
 * ToastProvider around everything mutating, and ThemeSync adopting the
 * account-stored theme pref. Cookie-dynamic by nature; forced here so the
 * group can never be statically cached.
 */
export const dynamic = 'force-dynamic'

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/sign-in?next=%2Fsettings%2Fprofile')
  }

  const profile = await getOwnProfile()
  if (!profile) {
    redirect('/auth/complete?next=%2Fsettings%2Fprofile')
  }

  // AAL step-up (M4-5): verified-but-unpassed factor → the TOTP challenge
  // gates the account surfaces too (settings hold keys and data controls).
  if (await mfaStepUpRequired()) {
    redirect('/auth/mfa?next=%2Fsettings%2Fprofile')
  }

  const prefs = fromStoredPrefs(profile.prefs)

  return (
    <ToastProvider>
      <ThemeSync theme={prefs.theme} />
      <Topnav displayName={profile.display_name} avatarUrl={profile.avatar_url} />
      {user.email_confirmed_at ? null : <VerifyEmailBanner />}
      <main>{children}</main>
    </ToastProvider>
  )
}
