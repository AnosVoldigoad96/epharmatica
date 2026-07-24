import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Button, MonographLabel } from '@epharmatica/ui'
import { requireSection } from '@/features/admin/queries'
import { auditEntityHref, getAuditEntries } from '@/features/admin/audit-queries'
import type { AuditFilters } from '@/features/admin/audit-queries'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.audit')
  return { title: t('title'), robots: { index: false, follow: false } }
}

/*
 * Audit-log surface (M4 §9): filterable by actor / action / entity / date
 * range (GET form — the URL is the filter state), entity deep-links, CSV
 * export of the same filter. Rows are append-only by construction
 * (probe 05); retention is D-b (12 months hot → yearly R2 export).
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('audit')
  const t = await getTranslations('admin.audit')

  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return typeof value === 'string' && value ? value : undefined
  }
  const filters: AuditFilters = {
    actor: first('actor'),
    action: first('action'),
    entity: first('entity'),
    from: first('from'),
    to: first('to'),
  }

  const page = await getAuditEntries(filters)
  const exportQuery = new URLSearchParams(
    Object.entries(filters).filter((pair): pair is [string, string] => Boolean(pair[1])),
  ).toString()

  const fmt = (iso: string) => iso.slice(0, 16).replace('T', ' ')

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex items-baseline gap-4 pt-6">
        <h1 className="flex-1 font-display text-[19px] font-bold">{t('title')}</h1>
        <Link
          href={`/admin/audit/export${exportQuery ? `?${exportQuery}` : ''}`}
          className="text-[12.5px] text-primary underline-offset-2 hover:underline"
        >
          {t('exportCsv')}
        </Link>
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <MonographLabel as="span" size="sm">
            {t('filters.actor')}
          </MonographLabel>
          <select
            name="actor"
            defaultValue={filters.actor ?? ''}
            className="h-8 border border-line bg-surface px-2 text-[13px]"
          >
            <option value="">{t('filters.anyActor')}</option>
            {page.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.username}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <MonographLabel as="span" size="sm">
            {t('filters.action')}
          </MonographLabel>
          <select
            name="action"
            defaultValue={filters.action ?? ''}
            className="h-8 border border-line bg-surface px-2 text-[13px]"
          >
            <option value="">{t('filters.anyAction')}</option>
            {page.actions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <MonographLabel as="span" size="sm">
            {t('filters.entity')}
          </MonographLabel>
          <select
            name="entity"
            defaultValue={filters.entity ?? ''}
            className="h-8 border border-line bg-surface px-2 text-[13px]"
          >
            <option value="">{t('filters.anyEntity')}</option>
            {page.entities.map((entity) => (
              <option key={entity} value={entity}>
                {entity}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <MonographLabel as="span" size="sm">
            {t('filters.from')}
          </MonographLabel>
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ''}
            className="h-8 border border-line bg-surface px-2 font-mono text-[12px]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <MonographLabel as="span" size="sm">
            {t('filters.to')}
          </MonographLabel>
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ''}
            className="h-8 border border-line bg-surface px-2 font-mono text-[12px]"
          />
        </label>
        <Button size="sm" type="submit">
          {t('filters.apply')}
        </Button>
        <Link
          href="/admin/audit"
          className="text-[12.5px] text-ink-2 underline-offset-2 hover:underline"
        >
          {t('filters.clear')}
        </Link>
      </form>

      {page.rows.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-center">
          <p className="text-[13px] text-ink-2">{t('empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <div className="grid min-w-[760px] grid-cols-[130px_110px_1fr_180px_90px] items-center gap-3 border-b border-ink px-4 py-2">
            {(['when', 'actor', 'action', 'entity', 'meta'] as const).map((key) => (
              <MonographLabel key={key} as="span" size="sm">
                {t(`columns.${key}`)}
              </MonographLabel>
            ))}
          </div>
          <ul className="min-w-[760px]">
            {page.rows.map((row) => {
              const href = auditEntityHref(row.entity, row.entity_id)
              return (
                <li
                  key={row.id}
                  className="grid grid-cols-[130px_110px_1fr_180px_90px] items-center gap-3 border-b border-line px-4 py-2 text-[12.5px] last:border-b-0"
                >
                  <span className="font-mono text-[11px] text-ink-2">{fmt(row.created_at)}</span>
                  <span className="truncate">{row.actorUsername ?? '—'}</span>
                  <span className="truncate font-mono text-[11.5px]">{row.action}</span>
                  <span className="min-w-0 truncate">
                    {href ? (
                      <Link href={href} className="text-primary underline-offset-2 hover:underline">
                        {row.entity}
                        {row.entity_id ? ` · …${row.entity_id.slice(-6)}` : ''}
                      </Link>
                    ) : (
                      <span className="text-ink-2">
                        {row.entity}
                        {row.entity_id ? ` · …${row.entity_id.slice(-6)}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="truncate font-mono text-[10px] text-ink-2">
                    {JSON.stringify(row.meta ?? {}).slice(0, 40)}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[12px] text-ink-2">{t('retentionNote')}</p>
    </div>
  )
}
