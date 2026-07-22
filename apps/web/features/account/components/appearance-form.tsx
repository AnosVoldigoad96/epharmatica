'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'next-intl'
import { THEMES, type Prefs, type TextSize, type Theme } from '@epharmatica/database'
import { MonographLabel, SegmentedControl, TextSizeControl, useToast } from '@epharmatica/ui'
import { updatePrefs } from '../actions'

/**
 * Appearance controls (wireframe 1p · hi-fi 3l · M2 §4.6): THEME segmented
 * control (System | Light | Dark) applied instantly via next-themes, READER
 * TEXT via the existing TextSizeControl (14 | 16 | 18). Both persist to
 * `profiles.prefs` fire-and-forget — toggles stay silent on success, only a
 * failed save speaks (persistent error toast).
 */
export function AppearanceForm({ initial }: { initial: Prefs }) {
  const t = useTranslations('settings.appearance')
  const { toast } = useToast()
  const { setTheme } = useTheme()

  const [theme, setThemePref] = useState<Theme>(initial.theme)
  const [textSize, setTextSize] = useState<TextSize>(initial.textSize)

  const persist = (next: Prefs) => {
    void updatePrefs(next)
      .then((result) => {
        if (!result.ok) {
          toast({ title: result.error, variant: 'error' })
        }
      })
      .catch(() => {
        toast({ title: t('saveError'), variant: 'error' })
      })
  }

  const handleTheme = (value: string) => {
    const next = value as Theme
    setThemePref(next)
    setTheme(next) // instant — next-themes flips the class before the save
    persist({ theme: next, textSize })
  }

  const handleTextSize = (value: TextSize) => {
    setTextSize(value)
    persist({ theme, textSize: value })
  }

  return (
    <div className="mt-5 flex flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <MonographLabel size="sm" as="div" className="sm:w-[110px] sm:flex-none">
          {t('theme')}
        </MonographLabel>
        <SegmentedControl
          options={THEMES.map((value) => ({ value, label: t(`themes.${value}`) }))}
          value={theme}
          onChange={handleTheme}
          label={t('theme')}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <MonographLabel size="sm" as="div" className="sm:w-[110px] sm:flex-none">
          {t('readerText')}
        </MonographLabel>
        <TextSizeControl value={textSize} onChange={handleTextSize} />
      </div>

      <p className="text-[12.5px] leading-[1.6] text-ink-2">{t('helper')}</p>
    </div>
  )
}
