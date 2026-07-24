'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { slugifyName } from '@epharmatica/database'
import type { ContentLevel } from '@epharmatica/database'
import { Button, Field, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import {
  createChapter,
  createSubject,
  createSubtopic,
  createTopic,
  renameNodeSlug,
  updateNodeMetadata,
} from '@/features/content/actions'
import { AdminSheet } from './admin-sheet'
import type { ListRow, NodeFormValues } from './list-types'

/**
 * Create/edit metadata sheet (M4 §5.2). No canvas draws this form — it
 * composes the system .field/.inp primitives per the design-canvas
 * conventions. Auto-slug fills from the name until the slug is touched;
 * once anything beneath is published the slug locks (greyed fill) and
 * renaming routes through the consequence ceremony (content_manager+).
 */

type NodeSheetProps = {
  level: ContentLevel
  open: boolean
  onClose: () => void
  canManage: boolean
  mode: 'create' | 'edit'
  parentId: string | null
  row?: ListRow
}

function levelFields(level: ContentLevel) {
  return {
    description: level === 'subject' || level === 'topic',
    icon: level === 'subject',
    defaultSemester: level === 'subject',
    semester: level === 'topic',
  }
}

export function NodeSheet({
  level,
  open,
  onClose,
  canManage,
  mode,
  parentId,
  row,
}: NodeSheetProps) {
  const t = useTranslations('admin.content')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const initial: NodeFormValues = row?.form ?? { name: '', slug: '' }
  const [name, setName] = useState(initial.name)
  const [slug, setSlug] = useState(initial.slug)
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [description, setDescription] = useState(initial.description ?? '')
  const [icon, setIcon] = useState(initial.icon ?? '')
  const [defaultSemester, setDefaultSemester] = useState(
    initial.defaultSemester ? String(initial.defaultSemester) : '',
  )
  const [semester, setSemester] = useState(initial.semester ? String(initial.semester) : '')
  const [error, setError] = useState<string | null>(null)

  // Rename ceremony sub-state (locked slugs only).
  const [renameOpen, setRenameOpen] = useState(false)
  const [newSlug, setNewSlug] = useState('')

  const fields = levelFields(level)
  const locked = mode === 'edit' && (row?.publishedBeneath ?? 0) > 0
  const levelName = t(`levelNames.${level}`)

  const oldPath = useMemo(() => (row ? `/learn/${row.pathSegments.join('/')}` : ''), [row])
  const renamedPath = useMemo(() => {
    if (!row || !newSlug) return ''
    const segments = [...row.pathSegments.slice(0, -1), newSlug]
    return `/learn/${segments.join('/')}`
  }, [row, newSlug])

  const values = (): Record<string, unknown> => {
    const base: Record<string, unknown> = { slug }
    if (level === 'subtopic') base.title = name
    else base.name = name
    if (fields.description) base.description = description || null
    if (fields.icon) base.icon = icon || null
    if (fields.defaultSemester)
      base.defaultSemester = defaultSemester ? Number(defaultSemester) : null
    if (fields.semester) base.semester = semester ? Number(semester) : null
    return base
  }

  const finish = (message: string) => {
    toast({ title: message })
    setError(null)
    onClose()
    router.refresh()
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      if (mode === 'create') {
        const payload = values()
        const result =
          level === 'subject'
            ? await createSubject(payload)
            : level === 'chapter'
              ? await createChapter(parentId ?? '', payload)
              : level === 'topic'
                ? await createTopic(parentId ?? '', payload)
                : await createSubtopic(parentId ?? '', payload)
        if (!result.ok) return setError(result.error)
        return finish(t('toasts.created'))
      }

      if (!row) return
      const result = await updateNodeMetadata(level, row.id, values())
      if (!result.ok) return setError(result.error)
      if (!locked && slug !== row.slug) {
        const renamed = await renameNodeSlug(level, row.id, slug, false)
        if (!renamed.ok) return setError(renamed.error)
      }
      return finish(t('toasts.saved'))
    })
  }

  const submitRename = () => {
    if (!row) return
    setError(null)
    startTransition(async () => {
      const result = await renameNodeSlug(level, row.id, newSlug, true)
      if (!result.ok) return setError(result.error)
      return finish(t('toasts.renamed'))
    })
  }

  const title =
    mode === 'create'
      ? t('sheet.createTitle', { levelName })
      : t('sheet.editTitle', { name: row?.name ?? '' })

  return (
    <AdminSheet open={open} title={title} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <Field
          label={level === 'subtopic' ? t('sheet.title') : t('sheet.name')}
          labelFor="node-name"
        >
          <input
            id="node-name"
            className={fieldClass}
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (!slugTouched) setSlug(slugifyName(event.target.value))
            }}
          />
        </Field>

        <Field
          label={t('sheet.slug')}
          labelFor="node-slug"
          hint={locked ? t('sheet.slugLockedHint') : t('sheet.slugHint')}
        >
          <input
            id="node-slug"
            className={`${fieldClass} font-mono text-[14px] ${locked ? 'bg-line/40 text-ink-2' : ''}`}
            value={slug}
            disabled={locked}
            onChange={(event) => {
              setSlugTouched(true)
              setSlug(event.target.value)
            }}
          />
        </Field>

        {locked && canManage ? (
          <div>
            {renameOpen ? (
              <div className="border border-warn/50 bg-warn/10 p-4">
                <MonographLabel as="div" size="sm" className="mb-3 text-warn">
                  {t('consequences.heading')}
                </MonographLabel>
                <Field label={t('sheet.newSlug')} labelFor="node-new-slug">
                  <input
                    id="node-new-slug"
                    className={`${fieldClass} font-mono text-[14px]`}
                    value={newSlug}
                    onChange={(event) => setNewSlug(event.target.value)}
                  />
                </Field>
                <div className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed">
                  <p>{t('consequences.urlLine')}</p>
                  <p className="font-mono text-[11px] text-ink-2">
                    {oldPath} → {renamedPath || '…'}
                  </p>
                  <p>{t('consequences.cacheLineRename', { levelName })}</p>
                </div>
                <div className="mt-4 flex gap-3">
                  <Button size="sm" pending={pending} disabled={!newSlug} onClick={submitRename}>
                    {t('sheet.confirmRename')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenameOpen(false)}>
                    {t('sheet.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setRenameOpen(true)}>
                {t('sheet.renameSlug')}
              </Button>
            )}
          </div>
        ) : null}

        {fields.description ? (
          <Field
            label={t('sheet.description')}
            labelFor="node-description"
            trailing={
              level === 'topic' ? (
                <span className="font-mono text-[10px] text-ink-2">{description.length} / 280</span>
              ) : undefined
            }
          >
            <textarea
              id="node-description"
              className={`${fieldClass} h-auto min-h-20 py-2`}
              value={description}
              maxLength={level === 'topic' ? 280 : 500}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>
        ) : null}

        {fields.icon ? (
          <Field label={t('sheet.icon')} labelFor="node-icon">
            <input
              id="node-icon"
              className={fieldClass}
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            />
          </Field>
        ) : null}

        {fields.defaultSemester || fields.semester ? (
          <Field
            label={fields.semester ? t('sheet.semester') : t('sheet.defaultSemester')}
            labelFor="node-semester"
            hint={t('sheet.semesterHint')}
          >
            <input
              id="node-semester"
              className={`${fieldClass} w-24`}
              inputMode="numeric"
              value={fields.semester ? semester : defaultSemester}
              onChange={(event) =>
                fields.semester
                  ? setSemester(event.target.value)
                  : setDefaultSemester(event.target.value)
              }
            />
          </Field>
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-3 border-t border-line pt-4">
          <Button size="sm" pending={pending} onClick={submit}>
            {mode === 'create' ? t('sheet.create', { levelName }) : t('sheet.save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('sheet.cancel')}
          </Button>
        </div>
      </div>
    </AdminSheet>
  )
}
