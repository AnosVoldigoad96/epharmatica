import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalArticle } from '../_components/legal-article'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.privacy')
  return { title: t('title'), description: t('description') }
}

export default function PrivacyPage() {
  return <LegalArticle fileName="privacy-policy.md" />
}
