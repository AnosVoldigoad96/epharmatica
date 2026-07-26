import type { Content } from './schema/types'

/**
 * The canonical full-coverage fixture (schema v2): every block kind, every
 * callout variant, both heading levels, all marks (incl. highlight/kbd and
 * color/size), links, inline dates, container lists with nesting, a merged
 * table with a header row, toggles with indented contents, columns, hr,
 * block + inline KaTeX equations, alignment/line-height props, captions,
 * code lines, an image carousel (captioned + caption-less slides), and a
 * Drug Card.
 * Renderer snapshots run over it (rules.md §6.4), and the M1 anchor fixture
 * suite (1.D) extends from it — keep block ids stable.
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
    id: 'fx-p-styled',
    type: 'p',
    align: 'center',
    lineHeight: 2,
    children: [
      { text: 'Key fact: ' },
      { text: 'salicylate toxicity', highlight: true },
      { text: ' is dose-dependent. Press ' },
      { text: 'Ctrl', kbd: true },
      { text: ' + ' },
      { text: 'F', kbd: true },
      { text: ' to search. ' },
      { text: 'Red flag', color: '#b91c1c' },
      { text: ' terms are ' },
      { text: 'flagged', backgroundColor: '#fef08a' },
      { text: ' and ' },
      { text: 'enlarged', fontSize: '20px' },
      { text: '. Reviewed ' },
      { type: 'date', date: '2026-07-24', children: [{ text: '' }] },
      { text: '.' },
    ],
  },
  {
    id: 'fx-ul-absorption',
    type: 'ul',
    children: [
      { type: 'li', children: [{ type: 'lic', children: [{ text: 'Rapid gastric absorption' }] }] },
      {
        type: 'li',
        children: [
          {
            type: 'lic',
            children: [{ text: 'Wide distribution, ' }, { text: 'protein-bound', bold: true }],
          },
          {
            type: 'ul',
            children: [
              {
                type: 'li',
                children: [{ type: 'lic', children: [{ text: 'Albumin binding ~90%' }] }],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'fx-ol-steps',
    type: 'ol',
    children: [
      {
        type: 'li',
        children: [{ type: 'lic', children: [{ text: 'Hydrolysis to salicylate' }] }],
      },
      { type: 'li', children: [{ type: 'lic', children: [{ text: 'Hepatic conjugation' }] }] },
    ],
  },
  { id: 'fx-hr', type: 'hr', children: [{ text: '' }] },
  {
    id: 'fx-toggle-details',
    type: 'toggle',
    children: [{ text: 'Advanced: salicylate kinetics' }],
  },
  {
    id: 'fx-toggle-body-p',
    type: 'p',
    indent: 1,
    children: [{ text: 'Zero-order elimination emerges at toxic concentrations.' }],
  },
  {
    id: 'fx-toggle-body-ul',
    type: 'ul',
    indent: 1,
    children: [
      { type: 'li', children: [{ type: 'lic', children: [{ text: 'Half-life extends 20h+' }] }] },
    ],
  },
  {
    id: 'fx-columns',
    type: 'column_group',
    children: [
      {
        type: 'column',
        width: '50%',
        children: [{ type: 'p', children: [{ text: 'COX-1: constitutive, gastric protection.' }] }],
      },
      {
        type: 'column',
        width: '50%',
        children: [
          { type: 'p', children: [{ text: 'COX-2: inducible, inflammation.' }] },
          {
            type: 'ul',
            children: [
              { type: 'li', children: [{ type: 'lic', children: [{ text: 'Selective NSAIDs' }] }] },
            ],
          },
        ],
      },
    ],
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
          {
            type: 'td',
            colSpan: 2,
            children: [{ type: 'p', children: [{ text: 'Analgesic: 300–900 mg q4–6h' }] }],
          },
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
    id: 'fx-carousel-synthesis',
    type: 'carousel',
    images: [
      {
        asset_id: '7c1f3f7e-9d24-4c1a-8b60-2f9b2f6f1a01',
        url: 'https://cdn.example.com/content-media/prostaglandin-step-1.webp',
        alt: 'Arachidonic acid release from membrane phospholipids',
        width: 1200,
        height: 900,
        caption: [{ text: 'STEP 1 — Phospholipase A2' }],
      },
      {
        asset_id: '9e5b0d12-6a3c-4f8e-b7d1-5c4a8e2f9b02',
        url: 'https://cdn.example.com/content-media/prostaglandin-step-2.webp',
        alt: 'Cyclooxygenase converts arachidonic acid to PGH2',
        width: 1200,
        height: 900,
        caption: [{ text: 'STEP 2 — COX catalysis' }],
      },
      {
        asset_id: '2a7d9c44-1b5e-4d2f-9e83-7f6b3d1c8e03',
        url: 'https://cdn.example.com/content-media/prostaglandin-step-3.webp',
        alt: 'Tissue-specific synthases yield active prostanoids',
        width: 1200,
        height: 900,
      },
    ],
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
    id: 'fx-equation-henderson',
    type: 'equation',
    texExpression: 'pH = pK_a + \\log_{10}\\frac{[A^-]}{[HA]}',
    children: [{ text: '' }],
  },
  {
    id: 'fx-p-inline-equation',
    type: 'p',
    children: [
      { text: 'Clearance follows ' },
      { type: 'inline_equation', texExpression: 'CL = k_e \\cdot V_d', children: [{ text: '' }] },
      { text: ' at steady state.' },
    ],
  },
  {
    id: 'fx-p-outro',
    type: 'p',
    children: [{ text: 'Review the monitoring parameters before the next unit.' }],
  },
]

/**
 * A v1 (flat-list) document as rows still store it — the dual-read tests
 * upgrade this through legacy-lists.ts and assert the container result.
 */
export const LEGACY_FLAT_LIST_DOCUMENT: Content = [
  { id: 'lg-h2', type: 'h2', children: [{ text: 'Pharmacokinetics' }] },
  {
    id: 'lg-li-absorption',
    type: 'p',
    listStyleType: 'disc',
    children: [{ text: 'Rapid gastric absorption' }],
  },
  {
    id: 'lg-li-distribution',
    type: 'p',
    listStyleType: 'disc',
    children: [{ text: 'Wide distribution, ' }, { text: 'protein-bound', bold: true }],
  },
  {
    id: 'lg-li-distribution-detail',
    type: 'p',
    listStyleType: 'disc',
    indent: 2,
    children: [{ text: 'Albumin binding ~90%' }],
  },
  {
    id: 'lg-ol-step-1',
    type: 'p',
    listStyleType: 'decimal',
    children: [{ text: 'Hydrolysis to salicylate' }],
  },
  {
    id: 'lg-ol-step-2',
    type: 'p',
    listStyleType: 'decimal',
    children: [{ text: 'Hepatic conjugation' }],
  },
  { id: 'lg-p-outro', type: 'p', children: [{ text: 'Plain closing paragraph.' }] },
]
