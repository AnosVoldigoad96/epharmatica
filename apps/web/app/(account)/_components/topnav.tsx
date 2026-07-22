import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { AvatarSquare } from '@epharmatica/ui'
import { BrandMark, BrandWordmark } from '@/app/(marketing)/_components/brand-mark'

/**
 * Account topnav (canvas .topnav · STYLE §5): 64px bar, hard ink bottom
 * rule, brand mark + wordmark linking home, spacer, then the 40px avatar
 * square linking to /settings/profile (its aria-label carries the name —
 * the avatar image itself is decorative).
 */
export async function Topnav({
  displayName,
  avatarUrl,
}: {
  displayName: string
  avatarUrl: string | null
}) {
  const t = await getTranslations('settings.topnav')

  return (
    <header className="border-b border-ink bg-paper">
      <div className="mx-auto flex h-16 w-full max-w-content items-center px-5 sm:px-6 md:px-8">
        <Link href="/" aria-label={t('home')} className="flex items-center gap-2.5">
          <BrandMark size={24} />
          <BrandWordmark />
        </Link>
        <span className="flex-1" />
        <Link
          href="/settings/profile"
          aria-label={t('settings')}
          className="flex items-center py-3"
        >
          <AvatarSquare src={avatarUrl} name={displayName} size={40} />
        </Link>
      </div>
    </header>
  )
}
