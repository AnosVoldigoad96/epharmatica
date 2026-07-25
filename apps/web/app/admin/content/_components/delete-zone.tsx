'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ContentLevel } from '@epharmatica/database'
import { Button, MonographLabel } from '@epharmatica/ui'
import { DeleteDialog } from './delete-dialog'
import type { RowStatus } from './list-types'

/**
 * Danger-zone rail section for detail pages (admin+ only — the server page
 * resolves the viewer's role and gates rendering). One danger-outlined
 * panel whose single affordance opens the typed-name DeleteDialog;
 * afterDeleteHref lands a successful delete on the parent list instead of
 * a 404 on the just-deleted node.
 */
export function DeleteZone({
  level,
  id,
  name,
  status,
  afterDeleteHref,
}: {
  level: ContentLevel
  id: string
  name: string
  status: RowStatus
  afterDeleteHref: string
}) {
  const t = useTranslations('admin.content')
  const [open, setOpen] = useState(false)
  const levelName = t(`levelNames.${level}`)

  return (
    <section className="border border-danger/50 bg-surface p-4">
      <MonographLabel as="h2" size="sm" className="mb-2 text-danger">
        {t('delete.zoneHeading')}
      </MonographLabel>
      <p className="mb-3 text-[12px] leading-relaxed text-ink-2">{t('delete.zoneBody')}</p>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        {t('delete.zoneButton', { levelName })}
      </Button>
      {open ? (
        <DeleteDialog
          level={level}
          id={id}
          name={name}
          status={status}
          open
          onClose={() => setOpen(false)}
          afterDeleteHref={afterDeleteHref}
        />
      ) : null}
    </section>
  )
}
