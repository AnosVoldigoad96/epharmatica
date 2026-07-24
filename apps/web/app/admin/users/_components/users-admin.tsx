'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button, Field, MonographLabel, fieldClass, useToast } from '@epharmatica/ui'
import type { AppRole } from '@/features/admin/permissions'
import { assignRole, forceRename, searchUsers } from '@/features/users-admin/actions'
import type { AdminUserRow } from '@/features/users-admin/actions'
import { AdminSheet } from '../../content/_components/admin-sheet'

/**
 * Users administration surface (M4 §7 · hi-fi 3aj conventions): search →
 * ink-hairlined results table (user/role/email/created + status chips)
 * with inline text actions Assign role… / Force-rename… (AdminSheets),
 * then the read-only deletion-grace list. The role picker is limited
 * CLIENT-SIDE to grants below the viewer's rank (super_admin option only
 * for super_admin viewers, behind the typed confirmation) — mirroring the
 * admin_set_role RPC, which stays the authority.
 */

/** Mirror of role_rank() (migration 016) — keep the two in sync. */
const ROLE_RANK: Record<AppRole, number> = {
  user: 0,
  author: 10,
  reviewer: 10,
  blog_editor: 10,
  moderator: 10,
  jobs_manager: 10,
  support: 10,
  content_manager: 20,
  admin: 80,
  super_admin: 100,
}

/** Every role, rank-ascending — the picker filters this by viewer rank. */
const ALL_ROLES: readonly AppRole[] = [
  'user',
  'author',
  'reviewer',
  'blog_editor',
  'moderator',
  'jobs_manager',
  'support',
  'content_manager',
  'admin',
  'super_admin',
]

function formatDate(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase()
}

function RoleChip({ role }: { role: AppRole }) {
  const t = useTranslations('admin.users')
  const cls =
    role === 'admin' || role === 'super_admin'
      ? 'border-ink text-ink'
      : role === 'user'
        ? 'border-line text-ink-2'
        : 'border-primary text-primary'
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${cls}`}
    >
      {t(`roles.${role}`)}
    </span>
  )
}

type UsersAdminProps = {
  heading: string
  viewerId: string
  viewerRole: AppRole
  graceUsers: AdminUserRow[]
}

const ROW_GRID = 'grid-cols-[1.2fr_140px_1.4fr_110px_180px]'

export function UsersAdmin({ heading, viewerId, viewerRole, graceUsers }: UsersAdminProps) {
  const t = useTranslations('admin.users')
  const router = useRouter()
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [assignTarget, setAssignTarget] = useState<AdminUserRow | null>(null)
  const [renameTarget, setRenameTarget] = useState<AdminUserRow | null>(null)

  const runSearch = (value: string) => {
    startTransition(async () => {
      const result = await searchUsers(value)
      if (!result.ok) {
        toast({ title: result.error, variant: 'error' })
        return
      }
      setRows(result.users)
    })
  }

  /** After a landed mutation: toast, refresh the rows AND the grace list. */
  const onMutated = (message: string) => {
    setAssignTarget(null)
    setRenameTarget(null)
    toast({ title: message })
    if (rows !== null) runSearch(query)
    router.refresh()
  }

  /** Assign role… mirrors the RPC: never yourself, never peers or above. */
  const canAssign = (row: AdminUserRow) =>
    row.id !== viewerId && ROLE_RANK[row.role] < ROLE_RANK[viewerRole]

  return (
    <div>
      <div className="mb-4 flex items-center gap-4">
        <h1 className="flex-1 font-display text-[19px] font-bold">{heading}</h1>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          runSearch(query)
        }}
        className="mb-4 flex flex-wrap items-center gap-3"
      >
        <MonographLabel as="label" htmlFor="users-search" size="sm">
          {t('search.label')}
        </MonographLabel>
        <input
          id="users-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('search.placeholder')}
          className="h-8 w-72 border border-line bg-surface px-2 text-[13px] text-ink placeholder:text-ink-2"
        />
        <Button size="sm" type="submit" pending={pending}>
          {t('search.button')}
        </Button>
        <span className="text-[12px] text-ink-2">{t('search.hint')}</span>
      </form>

      {rows === null ? (
        <div className="border border-line bg-surface p-8 text-center">
          <p className="text-[13px] text-ink-2">{t('search.idleBody')}</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-line bg-surface p-8 text-center">
          <MonographLabel as="div" size="sm" className="mb-2">
            {t('search.emptyLabel')}
          </MonographLabel>
          <p className="text-[13px] text-ink-2">{t('search.emptyBody')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line bg-surface">
          <div
            className={`grid min-w-[860px] ${ROW_GRID} items-center gap-3 border-b border-ink px-4 py-2`}
          >
            {(['user', 'role', 'email', 'created', 'actions'] as const).map((key) => (
              <MonographLabel key={key} as="span" size="sm">
                {t(`columns.${key}`)}
              </MonographLabel>
            ))}
          </div>
          <ul className="min-w-[860px]">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`grid ${ROW_GRID} items-center gap-3 border-b border-line px-4 py-[11px] last:border-b-0`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold">{row.username}</span>
                  <span className="block truncate text-[12px] text-ink-2">{row.display_name}</span>
                  {row.deletion_requested_at ? (
                    <span className="mt-1 inline-block border border-danger bg-surface px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-danger">
                      {t('chips.deletion')}
                    </span>
                  ) : null}
                </span>

                <span>
                  <RoleChip role={row.role} />
                </span>

                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-mono text-[11.5px] text-ink">{row.email}</span>
                  {row.email_confirmed_at === null ? (
                    <span className="shrink-0 border border-warn/60 bg-warn/10 px-1 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-warn">
                      {t('chips.unverified')}
                    </span>
                  ) : null}
                </span>

                <span className="font-mono text-[11px] text-ink-2">
                  {formatDate(row.created_at)}
                </span>

                <span className="flex gap-2.5 text-[12.5px]">
                  {canAssign(row) ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-2 hover:underline"
                      onClick={() => setAssignTarget(row)}
                    >
                      {t('actions.assignRole')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => setRenameTarget(row)}
                  >
                    {t('actions.forceRename')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="mt-8">
        <div className="mb-2 flex items-center gap-2">
          <MonographLabel as="h2" size="sm">
            {t('grace.heading')}
          </MonographLabel>
          <span className="border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-2">
            {t('grace.readOnly')}
          </span>
        </div>
        {graceUsers.length === 0 ? (
          <div className="border border-line bg-surface p-6 text-center">
            <p className="text-[13px] text-ink-2">{t('grace.empty')}</p>
          </div>
        ) : (
          <div className="border border-line bg-surface">
            <div className="grid grid-cols-[1fr_1.4fr_140px] items-center gap-3 border-b border-ink px-4 py-2">
              {(['user', 'email', 'requested'] as const).map((key) => (
                <MonographLabel key={key} as="span" size="sm">
                  {t(`grace.columns.${key}`)}
                </MonographLabel>
              ))}
            </div>
            <ul>
              {graceUsers.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-[1fr_1.4fr_140px] items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{row.username}</span>
                    <span className="block truncate text-[11.5px] text-ink-2">
                      {row.display_name}
                    </span>
                  </span>
                  <span className="truncate font-mono text-[11.5px] text-ink">{row.email}</span>
                  <span className="font-mono text-[11px] text-ink-2">
                    {row.deletion_requested_at ? formatDate(row.deletion_requested_at) : '—'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2 text-[12px] text-ink-2">{t('grace.note')}</p>
      </section>

      {assignTarget ? (
        <AssignRoleSheet
          target={assignTarget}
          viewerRole={viewerRole}
          onClose={() => setAssignTarget(null)}
          onDone={() => onMutated(t('toasts.roleAssigned'))}
        />
      ) : null}
      {renameTarget ? (
        <ForceRenameSheet
          target={renameTarget}
          onClose={() => setRenameTarget(null)}
          onDone={() => onMutated(t('toasts.renamed'))}
        />
      ) : null}
    </div>
  )
}

function AssignRoleSheet({
  target,
  viewerRole,
  onClose,
  onDone,
}: {
  target: AdminUserRow
  viewerRole: AppRole
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations('admin.users')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Grants strictly below the viewer's rank; super_admin viewers may also
  // grant super_admin — behind the typed confirmation (M4 §7).
  const options = ALL_ROLES.filter((role) => ROLE_RANK[role] < ROLE_RANK[viewerRole])
  if (viewerRole === 'super_admin') options.push('super_admin')

  const [role, setRole] = useState<AppRole>(
    options.includes(target.role) ? target.role : (options[0] ?? 'user'),
  )
  const [confirmation, setConfirmation] = useState('')

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await assignRole(
        target.id,
        role,
        role === 'super_admin' ? confirmation : undefined,
      )
      if (!result.ok) return setError(result.error)
      onDone()
    })
  }

  return (
    <AdminSheet open title={t('assign.title', { username: target.username })} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <Field label={t('assign.roleLabel')} labelFor="assign-role" hint={t('assign.roleHint')}>
          <select
            id="assign-role"
            value={role}
            onChange={(event) => setRole(event.target.value as AppRole)}
            className={fieldClass}
          >
            {options.map((option) => (
              <option key={option} value={option}>
                {t(`roles.${option}`)}
              </option>
            ))}
          </select>
        </Field>

        {role === 'super_admin' ? (
          <Field
            label={t('assign.confirmLabel', { username: target.username })}
            labelFor="assign-confirm"
            hint={t('assign.confirmHint')}
            required
          >
            <input
              id="assign-confirm"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              className={`${fieldClass} font-mono`}
            />
          </Field>
        ) : null}

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-3 border-t border-line pt-4">
          <Button
            size="sm"
            pending={pending}
            disabled={role === 'super_admin' && confirmation.trim() === ''}
            onClick={submit}
          >
            {t('assign.confirm')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('assign.cancel')}
          </Button>
        </div>
      </div>
    </AdminSheet>
  )
}

function ForceRenameSheet({
  target,
  onClose,
  onDone,
}: {
  target: AdminUserRow
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations('admin.users')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [newUsername, setNewUsername] = useState('')
  const [reason, setReason] = useState('')

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const result = await forceRename(target.id, newUsername.trim(), reason)
      if (!result.ok) return setError(result.error)
      onDone()
    })
  }

  return (
    <AdminSheet open title={t('rename.title', { username: target.username })} onClose={onClose}>
      <div className="flex flex-col gap-4 p-5">
        <Field
          label={t('rename.usernameLabel')}
          labelFor="rename-username"
          hint={t('rename.usernameHint')}
          required
        >
          <input
            id="rename-username"
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            autoComplete="off"
            className={`${fieldClass} font-mono`}
          />
        </Field>

        <Field
          label={t('rename.reasonLabel')}
          labelFor="rename-reason"
          hint={t('rename.reasonHint')}
          required
        >
          <textarea
            id="rename-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="w-full min-w-0 border border-line bg-surface p-3 font-sans text-[16px] text-ink focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          />
        </Field>

        <p className="border border-warn/60 bg-warn/10 p-3 text-[12.5px] text-warn">
          {t('rename.consequence', { username: target.username })}
        </p>

        {error ? (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex gap-3 border-t border-line pt-4">
          <Button
            size="sm"
            pending={pending}
            disabled={newUsername.trim() === '' || reason.trim() === ''}
            onClick={submit}
          >
            {t('rename.confirm')}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('rename.cancel')}
          </Button>
        </div>
      </div>
    </AdminSheet>
  )
}
