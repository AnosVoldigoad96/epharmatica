'use client'

import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import { USER_TYPES, type UserType } from '@epharmatica/database'
import {
  AvatarSquare,
  Button,
  Field,
  SelectShell,
  fieldClass,
  selectClass,
  useToast,
} from '@epharmatica/ui'
import { updateProfile } from '../actions'
import { COUNTRIES } from '../countries'
import { AvatarEditor } from './avatar-editor'

/**
 * Profile settings form (wireframe 1p · hi-fi 3l · M2 §4.5): avatar block
 * (64px square + REPLACE chip button → crop dialog), USERNAME as a read-only
 * display (paper bg, ink-2, mono PERMANENT trailing — not an input), DISPLAY
 * NAME, USER TYPE + COUNTRY selects (2-col ≥ sm), INSTITUTION — OPTIONAL,
 * BIO with the live counter in the Field trailing slot, then a left-aligned
 * Save profile button. Success toasts 5 s; error toasts persist.
 */
const AVATAR_ACCEPT = ['image/png', 'image/jpeg', 'image/webp']

export type ProfileFormInitial = {
  username: string
  displayName: string
  avatarUrl: string | null
  userType: UserType
  country: string | null
  institution: string | null
  bio: string | null
}

export function ProfileForm({ initial }: { initial: ProfileFormInitial }) {
  const t = useTranslations('settings.profile')
  const tErrors = useTranslations('auth.errors')
  const { toast } = useToast()

  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [displayName, setDisplayName] = useState(initial.displayName)
  const [userType, setUserType] = useState<UserType>(initial.userType)
  const [country, setCountry] = useState(initial.country ?? '')
  const [institution, setInstitution] = useState(initial.institution ?? '')
  const [bio, setBio] = useState(initial.bio ?? '')
  const [pending, setPending] = useState(false)
  const [editorFile, setEditorFile] = useState<File | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)

  const closeEditor = useCallback(() => setEditorFile(null), [])
  const handleSaved = useCallback((url: string) => {
    setAvatarUrl(url)
    setEditorFile(null)
  }, [])

  const handleFilePicked = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) {
      return
    }
    if (!AVATAR_ACCEPT.includes(file.type)) {
      toast({ title: t('avatar.errors.badType'), variant: 'error' })
      return
    }
    setEditorFile(file)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) {
      return
    }
    setPending(true)
    try {
      const result = await updateProfile({
        displayName,
        userType,
        country: country || null,
        institution: institution || null,
        bio: bio || null,
      })
      if (result.ok) {
        toast({ title: t('saved') })
      } else {
        toast({ title: result.error, variant: 'error' })
      }
    } catch {
      toast({ title: tErrors('generic'), variant: 'error' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-6 @sm:flex-row @sm:items-start">
      {/* Avatar block — the only avatar affordance is REPLACE (hi-fi 3l). */}
      <div className="flex flex-none flex-col items-center gap-2.5">
        <AvatarSquare src={avatarUrl} name={displayName || initial.username} size={64} />
        <input
          ref={fileRef}
          type="file"
          accept={AVATAR_ACCEPT.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            handleFilePicked(event.target.files)
            event.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group inline-flex min-h-10 cursor-pointer items-center px-1 [@media(pointer:coarse)]:min-h-11"
        >
          {/* 24px drawn chip; the button around it carries the ≥40px hit area. */}
          <span className="inline-flex items-center border border-ink bg-surface px-[9px] py-1 font-mono text-[11px] uppercase leading-[14px] tracking-[0.05em] text-ink group-hover:bg-primary-tint group-active:bg-primary-tint">
            {t('avatar.replace')}
          </span>
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {/* USERNAME — permanent, rendered as a read-only display, not an input. */}
        <Field label={t('username')} trailing={t('usernamePermanent')}>
          <div className="flex h-10 items-center border border-line bg-paper px-3 text-[15px] text-ink-2 [@media(pointer:coarse)]:h-11">
            {initial.username}
          </div>
        </Field>

        <Field label={t('displayName')} labelFor="profile-display-name">
          <input
            id="profile-display-name"
            name="displayName"
            type="text"
            required
            minLength={2}
            maxLength={50}
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={fieldClass}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
          <Field label={t('userType')} labelFor="profile-user-type">
            <SelectShell>
              <select
                id="profile-user-type"
                name="userType"
                value={userType}
                onChange={(event) => setUserType(event.target.value as UserType)}
                className={selectClass}
              >
                {USER_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {t(`userTypes.${value}`)}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>

          <Field label={t('country')} labelFor="profile-country">
            <SelectShell>
              <select
                id="profile-country"
                name="country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className={selectClass}
              >
                <option value="">{t('countryNone')}</option>
                {COUNTRIES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>
        </div>

        <Field label={t('institution')} labelFor="profile-institution">
          <input
            id="profile-institution"
            name="institution"
            type="text"
            maxLength={120}
            autoComplete="organization"
            value={institution}
            onChange={(event) => setInstitution(event.target.value)}
            className={fieldClass}
          />
        </Field>

        <Field
          label={t('bio')}
          labelFor="profile-bio"
          trailing={t('bioCounter', { count: bio.length })}
        >
          <textarea
            id="profile-bio"
            name="bio"
            maxLength={280}
            rows={3}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className={`${fieldClass} h-auto min-h-16 py-2 leading-[1.55]`}
          />
        </Field>

        <div>
          <Button type="submit" pending={pending}>
            {t('save')}
          </Button>
        </div>
      </div>

      {editorFile ? (
        <AvatarEditor file={editorFile} onClose={closeEditor} onSaved={handleSaved} />
      ) : null}
    </form>
  )
}
