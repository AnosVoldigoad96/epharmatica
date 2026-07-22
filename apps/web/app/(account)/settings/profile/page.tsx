import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { MonographLabel } from '@epharmatica/ui'
import { ProfileForm } from '@/features/account/components/profile-form'
import { getOwnProfile } from '@/features/account/queries'

/*
 * /settings/profile (wireframe 1p · hi-fi 3l · M2 §4.5): PROFILE hard label
 * over the profile form — avatar block, permanent username display, editable
 * fields, save. The (account) layout owns the session/profile gates; the
 * re-check here only covers the row vanishing between renders.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.meta.profile')
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false },
  }
}

export default async function ProfileSettingsPage() {
  const t = await getTranslations('settings.profile')

  const profile = await getOwnProfile()
  if (!profile) {
    redirect('/auth/complete?next=%2Fsettings%2Fprofile')
  }

  return (
    <div>
      <MonographLabel as="h2" rule="hard">
        {t('sectionLabel')}
      </MonographLabel>
      <ProfileForm
        initial={{
          username: profile.username,
          displayName: profile.display_name,
          avatarUrl: profile.avatar_url,
          userType: profile.user_type,
          country: profile.country,
          institution: profile.institution,
          bio: profile.bio,
        }}
      />
    </div>
  )
}
