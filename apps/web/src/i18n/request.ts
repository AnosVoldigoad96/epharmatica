import { getRequestConfig } from 'next-intl/server'

/**
 * next-intl request config. English-only catalog at launch; Urdu is locale #2
 * (PRD A2) — routing stays additive because every string already flows
 * through next-intl (docs/rules.md §8.1).
 */
export default getRequestConfig(async () => {
  const locale = 'en'

  return {
    locale,
    messages: (await import('../../messages/en.json')).default,
  }
})
