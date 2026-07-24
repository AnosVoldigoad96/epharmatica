import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { MonographLabel } from '@epharmatica/ui'
import { Chip } from '@/app/(marketing)/_components/chip'
import { SignInMethodsPanel } from '@/features/account/components/sign-in-methods'
import { SignOutEverywhere } from '@/features/account/components/sign-out-everywhere'
import { TotpPanel } from '@/features/account/components/totp-panel'
import { getSessionUser, getSignInMethods, type SignInMethods } from '@/features/account/queries'
import { getAdminProfile } from '@/features/admin/queries'
import { createClient } from '@/lib/supabase/server'

/*
 * /settings/sessions (wireframe 1r · hi-fi 3n · M2 §4.3): SIGN-IN METHODS
 * list derived from auth.getUserIdentities() (embedded identities as the
 * fallback), the single Sign out everywhere control (no per-device session
 * list is drawn — deliberate), and the TOTP row: STAFF get the real
 * enrollment panel (M4-5 §13 — optional, enforcement off), plain users keep
 * the COMING SOON chip (getAdminProfile returns null for them).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.meta.sessions')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function SessionsSettingsPage() {
  const t = await getTranslations('settings.sessions')

  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/sign-in?next=%2Fsettings%2Fsessions')
  }

  let methods: SignInMethods = { hasPassword: false, google: { linked: false, email: null } }
  try {
    const supabase = await createClient()
    methods = await getSignInMethods(supabase, user)
  } catch {
    // Env unset never reaches here (getSessionUser gated above); an identity
    // read failure degrades to "nothing linked" rather than crashing.
  }

  // Staff (any role above `user`) see the TOTP enrollment panel; null for
  // everyone else — they keep the COMING SOON chip.
  const staffProfile = await getAdminProfile()

  return (
    <div className="flex flex-col gap-8">
      <section>
        <MonographLabel as="h2" rule="hard">
          {t('methodsLabel')}
        </MonographLabel>
        <SignInMethodsPanel
          hasPassword={methods.hasPassword}
          googleLinked={methods.google.linked}
          googleEmail={methods.google.email}
        />
        <p className="mt-3 text-[13px] leading-[1.5] text-ink-2">{t('methodsHelper')}</p>
      </section>

      <section>
        <MonographLabel as="h2" rule="hard">
          {t('sessionsLabel')}
        </MonographLabel>
        <SignOutEverywhere />
      </section>

      <section>
        <MonographLabel as="h2" rule="hard">
          {t('totpLabel')}
        </MonographLabel>
        {staffProfile ? (
          <TotpPanel />
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3">
            <p className="text-[14px] text-ink">{t('totpRow')}</p>
            <Chip>{t('chipComingSoon')}</Chip>
          </div>
        )}
      </section>
    </div>
  )
}
