import { getTranslations } from 'next-intl/server'

/** Admin breadcrumb line (canvas .crumbs): CONTENT / … — mono, uppercase. */
export async function Crumbs({ segments }: { segments: string[] }) {
  const t = await getTranslations('admin.nav')
  const parts = [t('content'), ...segments]
  return (
    <p className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
      {parts.join(' / ')}
    </p>
  )
}
