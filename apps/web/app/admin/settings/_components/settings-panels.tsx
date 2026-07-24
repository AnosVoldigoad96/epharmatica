'use client'

import { useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { Json } from '@epharmatica/database'
import { Button, Field, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import {
  addReservedUsername,
  removeReservedUsername,
  reorderAiModels,
  setAiModelActive,
  setDefaultAiModel,
  setFlag,
  updateSiteSetting,
  upsertAiModel,
} from '@/features/admin-settings/actions'
import type { SettingsActionResult, SiteSettingKey } from '@/features/admin-settings/actions'
import type {
  AiModelRow,
  FeatureFlagRow,
  RegistryRow,
  SiteSettingsData,
} from '@/features/admin-settings/queries'
import { AdminSheet } from '../../content/_components/admin-sheet'

/**
 * Settings panels (M4 §8 · hi-fi 3aj conventions), stacked in PRD order:
 * feature flags · AI model registry · site metadata · reserved usernames ·
 * personal-data registry (read-only). Ink-hairlined tables with the ink
 * header rule, mono keys, chip states; every mutation lands a toast and a
 * router.refresh() so the RSC data comes back authoritative.
 */

type SettingsPanelsProps = {
  heading: string
  flags: FeatureFlagRow[]
  models: AiModelRow[]
  site: SiteSettingsData
  reserved: string[]
  registry: RegistryRow[]
}

export function SettingsPanels({
  heading,
  flags,
  models,
  site,
  reserved,
  registry,
}: SettingsPanelsProps) {
  return (
    <div>
      <h1 className="mb-5 font-display text-[19px] font-bold">{heading}</h1>
      <FlagsPanel flags={flags} />
      <ModelsPanel models={models} />
      <SitePanel site={site} />
      <ReservedPanel reserved={reserved} />
      <RegistryPanel registry={registry} />
    </div>
  )
}

function PanelHeader({
  heading,
  chip,
  action,
}: {
  heading: string
  chip?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <MonographLabel as="h2" size="sm">
        {heading}
      </MonographLabel>
      {chip}
      <span className="flex-1" />
      {action}
    </div>
  )
}

/** Shared mutation runner: toast the result, then refresh the RSC data. */
function useSettingsMutation() {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const run = (
    work: () => Promise<SettingsActionResult>,
    doneTitle: string,
    onDone?: () => void,
  ) => {
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      toast({ title: doneTitle })
      onDone?.()
      router.refresh()
    })
  }

  return { pending, run, toast, router, startTransition }
}

// ---------------------------------------------------------------------------
// Feature flags (§8: key · description · phase tag · audited on/off)
// ---------------------------------------------------------------------------

function FlagsPanel({ flags }: { flags: FeatureFlagRow[] }) {
  const t = useTranslations('admin.settings')
  const { pending, run } = useSettingsMutation()

  return (
    <section className="mb-8">
      <PanelHeader heading={t('flags.heading')} />
      {flags.length === 0 ? (
        <div className="border border-line bg-surface p-6 text-center">
          <p className="text-[13px] text-ink-2">{t('flags.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <div className="grid min-w-[720px] grid-cols-[220px_1fr_90px_80px] items-center gap-3 border-b border-ink px-4 py-2">
            {(['key', 'description', 'phase', 'state'] as const).map((column) => (
              <MonographLabel key={column} as="span" size="sm">
                {t(`flags.columns.${column}`)}
              </MonographLabel>
            ))}
          </div>
          <ul className="min-w-[720px]">
            {flags.map((flag) => (
              <li
                key={flag.key}
                className="grid grid-cols-[220px_1fr_90px_80px] items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0"
              >
                <span className="break-all font-mono text-[11.5px] text-ink">{flag.key}</span>
                <span className="text-[12.5px] text-ink-2">{flag.description ?? '—'}</span>
                <span>
                  {flag.phase_tag ? (
                    <span className="inline-block border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                      {flag.phase_tag}
                    </span>
                  ) : (
                    <span className="text-[11px] text-ink-2">—</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  aria-pressed={flag.enabled}
                  aria-label={t('flags.toggle', { key: flag.key })}
                  onClick={() => run(() => setFlag(flag.key, !flag.enabled), t('toasts.flagSaved'))}
                  className={`inline-block w-fit border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50 ${
                    flag.enabled
                      ? 'border-primary bg-primary-tint text-primary'
                      : 'border-line text-ink-2'
                  }`}
                >
                  {flag.enabled ? t('flags.on') : t('flags.off')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-2">{t('flags.note')}</p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// AI model registry (§8 / M3 §4.1: add, edit, deactivate, set default, sort)
// ---------------------------------------------------------------------------

const MODEL_GRID = 'grid-cols-[50px_1.1fr_1fr_110px_110px_60px]'

function ModelsPanel({ models }: { models: AiModelRow[] }) {
  const t = useTranslations('admin.settings')
  const { pending, run, toast, router, startTransition } = useSettingsMutation()

  // Server refreshes replace the rows: reset the optimistic order during
  // render (the list-editor derived-state pattern).
  const [order, setOrder] = useState<AiModelRow[]>(models)
  const [prevModels, setPrevModels] = useState(models)
  if (prevModels !== models) {
    setPrevModels(models)
    setOrder(models)
  }

  const [createOpen, setCreateOpen] = useState(false)
  const [editModel, setEditModel] = useState<AiModelRow | null>(null)

  const commitOrder = (next: AiModelRow[]) => {
    setOrder(next)
    startTransition(async () => {
      const result = await reorderAiModels(next.map((model) => model.id))
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        setOrder(models)
        return
      }
      toast({ title: t('toasts.reordered') })
      router.refresh()
    })
  }

  const moveBy = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta
    if (targetIndex < 0 || targetIndex >= order.length) return
    const next = [...order]
    const [item] = next.splice(index, 1)
    next.splice(targetIndex, 0, item as AiModelRow)
    commitOrder(next)
  }

  const closeSheets = () => {
    setCreateOpen(false)
    setEditModel(null)
  }

  return (
    <section className="mb-8">
      <PanelHeader
        heading={t('models.heading')}
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t('models.add')}
          </Button>
        }
      />
      {order.length === 0 ? (
        <div className="border border-line bg-surface p-6 text-center">
          <p className="text-[13px] text-ink-2">{t('models.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <div
            className={`grid min-w-[820px] ${MODEL_GRID} items-center gap-3 border-b border-ink px-4 py-2`}
          >
            {(['ord', 'model', 'label', 'default', 'active', 'actions'] as const).map((column) => (
              <MonographLabel key={column} as="span" size="sm">
                {t(`models.columns.${column}`)}
              </MonographLabel>
            ))}
          </div>
          <ul className="min-w-[820px]">
            {order.map((model, index) => (
              <li
                key={model.id}
                className={`grid ${MODEL_GRID} items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0 ${
                  model.active ? '' : 'opacity-60'
                }`}
              >
                <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-ink-2">
                  {index + 1}
                  <span className="ms-0.5 flex flex-col leading-none">
                    <button
                      type="button"
                      aria-label={t('models.moveUp', { label: model.label })}
                      disabled={index === 0 || pending}
                      onClick={() => moveBy(index, -1)}
                      className="text-[9px] text-ink-2 hover:text-ink disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={t('models.moveDown', { label: model.label })}
                      disabled={index === order.length - 1 || pending}
                      onClick={() => moveBy(index, 1)}
                      className="text-[9px] text-ink-2 hover:text-ink disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </span>
                </span>

                <span className="min-w-0">
                  <span className="block truncate font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
                    {model.provider}
                  </span>
                  <span className="block truncate font-mono text-[11.5px] text-ink">
                    {model.model_id}
                  </span>
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold">{model.label}</span>
                  {model.tier_note ? (
                    <span className="block truncate text-[11.5px] text-ink-2">
                      {model.tier_note}
                    </span>
                  ) : null}
                </span>

                <span>
                  {model.is_default ? (
                    <span className="inline-block border border-primary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
                      {t('models.defaultChip')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(() => setDefaultAiModel(model.id), t('toasts.modelDefault'))
                      }
                      className="text-[12px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {t('models.setDefault')}
                    </button>
                  )}
                </span>

                <span className="flex flex-col items-start gap-1">
                  <span
                    className={`inline-block border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${
                      model.active ? 'border-primary text-primary' : 'border-line text-ink-2'
                    }`}
                  >
                    {model.active ? t('models.activeChip') : t('models.inactiveChip')}
                  </span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() => setAiModelActive(model.id, !model.active), t('toasts.modelActive'))
                    }
                    className="text-[12px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {model.active ? t('models.deactivate') : t('models.activate')}
                  </button>
                </span>

                <span className="text-[12.5px]">
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => setEditModel(model)}
                  >
                    {t('models.edit')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {createOpen || editModel ? (
        <ModelSheet
          model={editModel}
          onClose={closeSheets}
          onDone={() => {
            closeSheets()
            toast({ title: t('toasts.modelSaved') })
            router.refresh()
          }}
        />
      ) : null}
    </section>
  )
}

function ModelSheet({
  model,
  onClose,
  onDone,
}: {
  model: AiModelRow | null
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations('admin.settings.models.sheet')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [provider, setProvider] = useState(model?.provider ?? '')
  const [modelId, setModelId] = useState(model?.model_id ?? '')
  const [label, setLabel] = useState(model?.label ?? '')
  const [tierNote, setTierNote] = useState(model?.tier_note ?? '')

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await upsertAiModel({
        id: model?.id,
        provider,
        modelId,
        label,
        tierNote,
      })
      if (!result.ok) return setError(result.error)
      onDone()
    })
  }

  return (
    <AdminSheet
      open
      title={model ? t('editTitle', { label: model.label }) : t('addTitle')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 p-5">
        <Field label={t('provider')} labelFor="model-provider" hint={t('providerHint')} required>
          <input
            id="model-provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
            className={`${fieldClass} font-mono`}
          />
        </Field>

        <Field label={t('modelId')} labelFor="model-id" hint={t('modelIdHint')} required>
          <input
            id="model-id"
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            className={`${fieldClass} font-mono`}
          />
        </Field>

        <Field label={t('label')} labelFor="model-label" hint={t('labelHint')} required>
          <input
            id="model-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            className={fieldClass}
          />
        </Field>

        <Field label={t('tierNote')} labelFor="model-tier" hint={t('tierNoteHint')}>
          <input
            id="model-tier"
            value={tierNote}
            onChange={(event) => setTierNote(event.target.value)}
            className={fieldClass}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-3 border-t border-line pt-4">
          <Button size="sm" pending={pending} onClick={submit}>
            {t('save')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </div>
    </AdminSheet>
  )
}

// ---------------------------------------------------------------------------
// Site metadata (§8: title, description, social image, contact addresses)
// ---------------------------------------------------------------------------

function SitePanel({ site }: { site: SiteSettingsData }) {
  const t = useTranslations('admin.settings')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [title, setTitle] = useState(site.title)
  const [description, setDescription] = useState(site.description)
  const [socialImage, setSocialImage] = useState(site.socialImage)
  const [contacts, setContacts] = useState<Record<string, string>>(site.contacts)

  const save = () => {
    startTransition(async () => {
      const updates: [SiteSettingKey, Json][] = []
      if (title.trim() !== site.title) updates.push(['site.title', title.trim()])
      if (description.trim() !== site.description) {
        updates.push(['site.description', description.trim()])
      }
      if (socialImage.trim() !== site.socialImage) {
        // Empty clears the image — stored as JSON null (the seeded shape).
        updates.push(['site.social_image', socialImage.trim() || null])
      }
      if (JSON.stringify(contacts) !== JSON.stringify(site.contacts)) {
        updates.push(['site.contacts', contacts])
      }

      for (const [key, value] of updates) {
        const result = await updateSiteSetting(key, value)
        if (!result.ok) {
          toast({ title: result.error, variant: 'error' })
          return
        }
      }
      toast({ title: t('toasts.siteSaved') })
      router.refresh()
    })
  }

  return (
    <section className="mb-8">
      <PanelHeader heading={t('site.heading')} />
      <div className="flex max-w-2xl flex-col gap-4 border border-line bg-surface p-5">
        <Field label={t('site.titleLabel')} labelFor="site-title">
          <input
            id="site-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldClass}
          />
        </Field>

        <Field label={t('site.descriptionLabel')} labelFor="site-description">
          <textarea
            id="site-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="w-full min-w-0 border border-line bg-surface p-3 font-sans text-[16px] text-ink focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </Field>

        <Field
          label={t('site.socialImageLabel')}
          labelFor="site-social-image"
          hint={t('site.socialImageHint')}
        >
          <input
            id="site-social-image"
            value={socialImage}
            onChange={(event) => setSocialImage(event.target.value)}
            placeholder="https://…"
            className={`${fieldClass} font-mono`}
          />
        </Field>

        <div>
          <MonographLabel as="div" size="sm" className="mb-2">
            {t('site.contactsLabel')}
          </MonographLabel>
          <div className="flex flex-col gap-2.5">
            {Object.entries(contacts).map(([key, value]) => (
              <label key={key} className="flex items-center gap-3">
                <span className="w-20 shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
                  {key}
                </span>
                <input
                  value={value}
                  onChange={(event) =>
                    setContacts((current) => ({ ...current, [key]: event.target.value }))
                  }
                  className="h-8 w-full min-w-0 border border-line bg-surface px-2 font-mono text-[12px] text-ink focus:border-primary"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="mt-1 border-t border-line pt-4">
          <Button size="sm" pending={pending} onClick={save}>
            {t('site.save')}
          </Button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Reserved usernames (§8 / M2 §4.4: chip list + add + remove)
// ---------------------------------------------------------------------------

function ReservedPanel({ reserved }: { reserved: string[] }) {
  const t = useTranslations('admin.settings')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()
  const [handle, setHandle] = useState('')

  const add = () => {
    startTransition(async () => {
      const result = await addReservedUsername(handle)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      toast({ title: t('toasts.reservedAdded') })
      setHandle('')
      router.refresh()
    })
  }

  const remove = (value: string) => {
    startTransition(async () => {
      const result = await removeReservedUsername(value)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      toast({ title: t('toasts.reservedRemoved') })
      router.refresh()
    })
  }

  return (
    <section className="mb-8">
      <PanelHeader heading={t('reserved.heading')} />
      <div className="border border-line bg-surface p-5">
        {reserved.length === 0 ? (
          <p className="mb-4 text-[13px] text-ink-2">{t('reserved.empty')}</p>
        ) : (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {reserved.map((value) => (
              <span
                key={value}
                className="flex items-center gap-1.5 border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink"
              >
                {value}
                <button
                  type="button"
                  aria-label={t('reserved.remove', { handle: value })}
                  disabled={pending}
                  onClick={() => remove(value)}
                  className="text-ink-2 hover:text-danger disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (handle.trim()) add()
          }}
          className="flex items-center gap-2 border-t border-line pt-4"
        >
          <input
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            placeholder={t('reserved.addPlaceholder')}
            aria-label={t('reserved.addPlaceholder')}
            className="h-8 w-52 border border-line bg-surface px-2 font-mono text-[12px] text-ink placeholder:text-ink-2 focus:border-primary"
          />
          <Button size="sm" type="submit" pending={pending} disabled={handle.trim() === ''}>
            {t('reserved.add')}
          </Button>
        </form>
        <p className="mt-2 text-[12px] text-ink-2">{t('reserved.hint')}</p>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Personal-data registry (§8 / M2 R-M2b: read-only — writes ride migrations)
// ---------------------------------------------------------------------------

function RegistryPanel({ registry }: { registry: RegistryRow[] }) {
  const t = useTranslations('admin.settings')

  return (
    <section className="mb-8">
      <PanelHeader
        heading={t('registry.heading')}
        chip={
          <span className="border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-2">
            {t('registry.readOnly')}
          </span>
        }
      />
      {registry.length === 0 ? (
        <div className="border border-line bg-surface p-6 text-center">
          <p className="text-[13px] text-ink-2">{t('registry.empty')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <div className="grid min-w-[680px] grid-cols-[190px_130px_60px_1fr] items-center gap-3 border-b border-ink px-4 py-2">
            {(['table', 'module', 'step', 'notes'] as const).map((column) => (
              <MonographLabel key={column} as="span" size="sm">
                {t(`registry.columns.${column}`)}
              </MonographLabel>
            ))}
          </div>
          <ul className="min-w-[680px]">
            {registry.map((row) => (
              <li
                key={row.table_name}
                className="grid grid-cols-[190px_130px_60px_1fr] items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
              >
                <span className="break-all font-mono text-[11.5px] text-ink">{row.table_name}</span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-2">
                  {row.module}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-ink">
                  {row.purge_step}
                </span>
                <span className="text-[12px] text-ink-2">{row.notes ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-2">{t('registry.note')}</p>
    </section>
  )
}
