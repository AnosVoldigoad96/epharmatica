import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalArticle } from '../_components/legal-article'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('legal.medicalDisclaimer')
  return { title: t('title'), description: t('description') }
}

export default function MedicalDisclaimerPage() {
  return <LegalArticle fileName="medical-disclaimer.md" />
}
