import type { Content } from './schema/types'

/**
 * The canonical full-coverage fixture: every block kind, every callout
 * variant, both heading levels, marks, links, nested flat lists, a table
 * with a header row, captions, code lines, and a Drug Card. Renderer
 * snapshots run over it (rules.md §6.4), and the M1 anchor fixture suite
 * (1.D) extends from it — keep block ids stable.
 */
export const FIXTURE_DOCUMENT: Content = [
  {
    id: 'fx-p-intro',
    type: 'p',
    children: [
      { text: 'Aspirin irreversibly inhibits ' },
      { text: 'cyclooxygenase', italic: true },
      { text: ' via ' },
      { text: 'acetylation', bold: true },
      { text: ', with H' },
      { text: '2', sub: true },
      { text: 'O as a byproduct — see ' },
      {
        type: 'a',
        url: 'https://example.com/cox-pathway',
        children: [{ text: 'the COX pathway' }],
      },
      { text: ' for context. Doses are written mg', strikethrough: true },
      { text: ' as ' },
      { text: 'mg/day', code: true },
      { text: ' (10' },
      { text: '3', sup: true },
      { text: ' µg).' },
    ],
  },
  { id: 'fx-toc', type: 'toc', children: [{ text: '' }] },
  { id: 'fx-h2-pharmacokinetics', type: 'h2', children: [{ text: 'Pharmacokinetics' }] },
  {
    id: 'fx-blockquote',
    type: 'blockquote',
    children: [{ text: 'All things are poison; the dosage alone makes a thing not poison.' }],
  },
  {
    id: 'fx-li-absorption',
    type: 'p',
    listStyleType: 'disc',
    children: [{ text: 'Rapid gastric absorption' }],
  },
  {
    id: 'fx-li-distribution',
    type: 'p',
    listStyleType: 'disc',
    children: [{ text: 'Wide distribution, ' }, { text: 'protein-bound', bold: true }],
  },
  {
    id: 'fx-li-distribution-detail',
    type: 'p',
    listStyleType: 'disc',
    indent: 2,
    children: [{ text: 'Albumin binding ~90%' }],
  },
  {
    id: 'fx-ol-step-1',
    type: 'p',
    listStyleType: 'decimal',
    children: [{ text: 'Hydrolysis to salicylate' }],
  },
  {
    id: 'fx-ol-step-2',
    type: 'p',
    listStyleType: 'decimal',
    children: [{ text: 'Hepatic conjugation' }],
  },
  { id: 'fx-h3-monitoring', type: 'h3', children: [{ text: 'Monitoring' }] },
  {
    id: 'fx-table-doses',
    type: 'table',
    children: [
      {
        type: 'tr',
        children: [
          { type: 'th', children: [{ type: 'p', children: [{ text: 'Indication' }] }] },
          { type: 'th', children: [{ type: 'p', children: [{ text: 'Dose' }] }] },
        ],
      },
      {
        type: 'tr',
        children: [
          { type: 'td', children: [{ type: 'p', children: [{ text: 'Antiplatelet' }] }] },
          { type: 'td', children: [{ type: 'p', children: [{ text: '75–100 mg daily' }] }] },
        ],
      },
      {
        type: 'tr',
        children: [
          { type: 'td', children: [{ type: 'p', children: [{ text: 'Analgesic' }] }] },
          { type: 'td', children: [{ type: 'p', children: [{ text: '300–900 mg q4–6h' }] }] },
        ],
      },
    ],
  },
  {
    id: 'fx-callout-definition',
    type: 'callout',
    variant: 'definition',
    children: [
      {
        type: 'p',
        children: [{ text: 'Salicylism: the toxidrome of chronic salicylate excess.' }],
      },
    ],
  },
  {
    id: 'fx-callout-pearl',
    type: 'callout',
    variant: 'clinical_pearl',
    children: [
      { type: 'p', children: [{ text: 'Enteric coating delays but does not reduce absorption.' }] },
      { type: 'p', children: [{ text: 'Chewing non-coated aspirin speeds onset in ACS.' }] },
    ],
  },
  {
    id: 'fx-callout-mnemonic',
    type: 'callout',
    variant: 'mnemonic',
    children: [
      { type: 'p', children: [{ text: 'ASA: Antiplatelet, Salicylism, Asthma caution.' }] },
    ],
  },
  {
    id: 'fx-callout-exam',
    type: 'callout',
    variant: 'exam_alert',
    children: [
      {
        type: 'p',
        children: [{ text: 'Reye syndrome association is a recurring exam favorite.' }],
      },
    ],
  },
  {
    id: 'fx-callout-warning',
    type: 'callout',
    variant: 'warning',
    children: [
      { type: 'p', children: [{ text: 'Avoid in children with viral illness (Reye syndrome).' }] },
    ],
  },
  {
    id: 'fx-img-structure',
    type: 'img',
    url: 'https://cdn.example.com/content-media/aspirin-structure.webp',
    alt: 'Skeletal structure of acetylsalicylic acid',
    asset_id: '4b825dc6-42b0-4a5e-a153-0aa891f5a2b3',
    width: 1200,
    height: 800,
    caption: [{ text: 'FIG 1 — Acetylsalicylic acid' }],
    children: [{ text: '' }],
  },
  {
    id: 'fx-video-mechanism',
    type: 'video',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    caption: [{ text: 'VIDEO — COX inhibition, step by step' }],
    children: [{ text: '' }],
  },
  {
    id: 'fx-code-calc',
    type: 'code_block',
    lang: 'text',
    children: [
      { type: 'code_line', children: [{ text: 'loading_dose = Vd × Cp_target' }] },
      { type: 'code_line', children: [{ text: 'maintenance = CL × Cp_ss × tau' }] },
    ],
  },
  {
    id: 'fx-drugcard-aspirin',
    type: 'drug_card',
    fields: {
      generic_name: 'Aspirin (acetylsalicylic acid)',
      brand_names: 'Disprin, Ascard',
      drug_class: 'NSAID (irreversible COX inhibitor)',
      mechanism: 'Irreversible acetylation of COX-1/COX-2',
      indications: 'ACS, secondary CV prevention, pain, fever',
      adverse_effects: 'GI bleeding, tinnitus, bronchospasm',
      interactions: 'Warfarin, methotrexate, other NSAIDs',
      dosing: '75–100 mg daily (antiplatelet)',
      notes: 'Stop 7 days before elective surgery.',
    },
    children: [{ text: '' }],
  },
  {
    id: 'fx-p-outro',
    type: 'p',
    children: [{ text: 'Review the monitoring parameters before the next unit.' }],
  },
]
