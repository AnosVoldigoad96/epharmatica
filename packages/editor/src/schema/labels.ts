import type { CalloutVariant, DrugCardFieldKey } from './types'

/**
 * Default English display labels for schema-owned chrome (callout eyebrows,
 * Drug Card field labels). Apps pass translated maps through the renderer's
 * `labels` prop — these defaults keep the package next-intl-free while the
 * catalog rule (rules.md §8.1) is honored at the app boundary.
 * Case styling (monograph uppercase) is CSS, not data.
 */
export const CALLOUT_LABELS: Record<CalloutVariant, string> = {
  definition: 'Definition',
  clinical_pearl: 'Clinical Pearl',
  mnemonic: 'Mnemonic',
  exam_alert: 'Exam Alert',
  warning: 'Warning',
}

export const DRUG_CARD_FIELD_LABELS: Record<DrugCardFieldKey, string> = {
  generic_name: 'Generic name',
  brand_names: 'Brand names',
  drug_class: 'Class',
  mechanism: 'Mechanism',
  indications: 'Indications',
  contraindications: 'Contraindications',
  adverse_effects: 'Adverse effects',
  interactions: 'Interactions',
  dosing: 'Dosing',
  monitoring: 'Monitoring',
  pregnancy_lactation: 'Pregnancy & lactation',
  notes: 'Notes',
}
