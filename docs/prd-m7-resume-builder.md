# Module PRD 07 — Resume Builder

|               |                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **Module**    | Resume Builder — guided data entry, four templates, client-side PDF, BYOK polish & review          |
| **Version**   | 1.0 · 18 Jul 2026                                                                                  |
| **Parents**   | Master PRD v1.5 (§7.8) · M3 (AI proxy contract §13) · M2 (privacy, purge registry) · STYLE.md v1.3 |
| **Decisions** | M7-1 … M7-6 — see §2                                                                               |
| **Phase**     | 3                                                                                                  |

## 1. Scope

**In:** the resume hub and builder, the fixed pharmacy-tuned section set (+ one Additional), the four templates with fixed accents, the completeness system with its export floor, client-side PDF export (A4/Letter), the photo policy, and both AI assists (polish + whole-resume review) on the user's key via M3. **Out:** public resume pages or share links (master non-goal), DOCX export, cover letters, reorderable sections — all noted futures (§11).

## 2. Module Decision Log

| #    | Decision      | Choice                                                      | Consequence                                                                                                   |
| ---- | ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| M7-1 | Count         | **Up to 5 resumes**                                         | Cap enforced server-side (RPC/trigger); duplicate-and-tailor within the cap (§4.1).                           |
| M7-2 | Sections      | **Fixed set + one "Additional" free section**               | Guided experience and ATS predictability preserved; one escape hatch (§4.3).                                  |
| M7-3 | AI scope      | **Polish (summary + bullets) + whole-resume review report** | Review = structured findings, never auto-applied; rides M3's proxy/guardrails (§4.7).                         |
| M7-4 | Photo         | **Styled templates only — never ATS Standard**              | Local-market expectation honored without ATS risk; auto-omitted with notice on template switch (§4.5).        |
| M7-5 | Accents       | **Fixed per template**                                      | Every export looks designed; no pickers (§4.5).                                                               |
| M7-6 | Export gating | **Hard floor: name + one contact; warn for the rest**       | Floor disables export with inline reason; a pre-export checklist offers "Export anyway" past warnings (§4.4). |

## 3. User Stories

1. As a final-year, I fill guided sections built for pharmacy careers — house job, licenses, publications — with tips that speak my profession's language.
2. I keep up to five tailored resumes ("Hospital", "Industry-QA", …), duplicating and tweaking instead of re-typing.
3. I flip between templates and my data never changes — the ATS Standard stays stark and parseable; the styled ones carry my photo if I choose.
4. I can't export a nameless, contactless PDF — but the platform never blocks me over an empty Publications section, it just tells me honestly.
5. With my own AI key, one tap tightens a clumsy bullet into two alternatives I can apply or ignore — and a full review tells me what to fix first without touching anything itself.
6. My resume is mine: it renders to PDF in my browser, and nothing about it is ever public.

## 4. Functional Specification

### 4.1 Hub — `/resume`

List of resumes (≤5): title (inline-rename), template thumbnail, updated-at, completeness glyph, actions (Open · Duplicate · Delete-with-confirm). **Create:** blank or duplicate; at cap, both are disabled with _"You have 5 resumes — delete one to create another."_ First-visit empty state invites with one action.

### 4.2 Builder layout

Left rail: section navigation with **per-section state glyphs** (STYLE §7 vocabulary reused: empty / partial / complete). Main pane: the active section's form. **Preview:** live, template-rendered, paged — side-by-side ≥ `lg`; below `lg`, a Form ⇄ Preview toggle (preview is a full step on mobile, per STYLE §6). Autosave: 1.5 s debounce + on blur; saving indicator in the monograph style (`SAVED · 14:02`).

### 4.3 Sections (fixed order, v1)

1. **Personal & contact** — name*, professional headline (≤80), email*, phone*, city, links (≤4, label+URL), **photo slot** (M7-4: square-crop upload → private bucket, styled templates only; the slot itself explains the ATS rule). _Floor fields per M7-6: name + (email or phone)._
2. **Summary** — ≤600 chars, live counter, AI polish target.
3. **Education** — degree, institution, city, dates (ongoing toggle), detail bullets ≤4.
4. **Experience** (incl. house job / internships — the tip copy says so) — role, organization, city, dates (current toggle), bullets ≤6 (AI polish targets).
5. **Licenses & certifications** — name, issuer, number (optional), date.
6. **Skills** — flat chips, ≤20.
7. **Publications & projects** — title, venue/link, year, one-liner.
8. **Additional** (M7-2) — one instance: free title (≤40) + bullet content; for the genuinely unusual (awards, languages, volunteering).
9. **References** — "Available on request" toggle **or** entries ≤3.
   Empty sections auto-omit from output; any section except Personal can also be manually hidden. Per-section pharmacy-specific tip lines throughout (content in code, reviewed copy).

### 4.4 Completeness & the export floor (M7-6)

Weighted meter (Personal 20 · Education 25 · Experience 25 · Summary 10 · Licenses 10 · Skills 10) drives the hub glyph and a builder progress strip. **Export floor:** name + one contact — below it, Export is disabled with the exact reason inline. Above the floor, Export opens a **pre-export checklist sheet**: warnings listed plainly ("Summary is empty · No experience bullets"), one primary **Export anyway** and one "Fix first" per item. Never more than honest friction.

### 4.5 Templates (M7-4, M7-5)

- **ATS Standard** (default): single column, semantic headings, Helvetica-family, zero graphics, **no photo ever** — the parser-first artifact.
- **Monograph** (teal accent): the brand made resume — mono field labels + hard rules.
- **Slate** (graphite accent): compact two-column.
- **Classic** (navy accent): traditional serif-led.
  Accents are **fixed** (M7-5). Template switch never mutates data; switching to ATS with a photo present shows a quiet chip: _"Photo omitted on the ATS template."_ All four render from the same versioned data (§5).

### 4.6 PDF export

Client-side via `@react-pdf/renderer` — the server never sees a rendered resume. A4 default, US-Letter toggle; embedded subset fonts; true text layer with correct reading order (CI-verified §9); keep-together rules on section headings; filename `{name}-resume-{template}.pdf` (slugged). Multi-page flows naturally; page numbers on page 2+.

### 4.7 AI assists (M7-3 — via the M3 contract, `feature: 'polish'` / `'review'`)

**Consent line (first use, per resume):** _"Your resume text will be sent to {provider} using your key."_ — acknowledged once, remembered.

- **Polish** — on Summary and any Experience/Education bullet: **Improve with AI** → two alternatives + "keep original"; applying replaces the field with a 10-second Undo toast. Prompt contract: professional register, action-verb-led, concise (≤ original length +20%), and the hard clause _"never invent facts, numbers, employers, or credentials — rephrase only what is given."_
- **Review report** — **Review my resume** serializes the resume (photo excluded) and returns a fixed-shape report rendered as a panel: **STRENGTHS** (≤3) · **FIX FIRST** (≤5, each targeting a section, tap-to-jump) · **BULLET UPGRADES** (≤4 rewrite suggestions with individual **Apply**) · **ATS NOTES** (general formatting/keyword observations). Nothing auto-applies; the panel carries the AI chip + disclaimer; a pre-run token estimate shows (M3 pattern). Both assists count against M3 caps and inherit its failure taxonomy; with no key configured, buttons render as _"Add an AI key to use this"_ linking Settings — never a mystery-disabled control.

## 5. Data Model

`resumes(id, user_id, title, template_id, data jsonb, updated_at)` — cap-5 enforced by a `security definer` create RPC (and a belt-and-braces trigger). `data` is versioned: `{ v: 1, personal: {...}, summary, education: [...], experience: [...], licenses: [...], skills: [...], publications: [...], additional: {title, items[]}|null, references: {on_request}|{entries[]}, hidden_sections: [] }`. Photo: private bucket `resume-photos/{user_id}/{resume_id}.webp`, path stored in `data.personal.photo`; export fetches it via signed URL client-side and embeds locally. Registered in the **personal-data purge registry** (M2 R-M2b): resumes rows + photo objects.

## 6. RLS & Privacy

`resumes`: owner-only (archetype a); photo bucket policy scopes read/write to the owner's path; no staff read path exists (support debugging happens on user-shared exports, by policy). CI: owner isolation, cap enforcement via RPC and via direct-insert attempt, signed-URL scope (user B's token fails), purge-registry coverage test.

## 7. Edge Cases & Rules

Duplicate at cap → blocked with the §4.1 message. Deleting a resume deletes its photo object (and orphan-sweep cron backs it up weekly). Account purge removes all five + photos (registry-proven). Very long entries paginate; fixtures pin the tricky breaks (bullet lists across pages, References last). Letter vs A4 both fixture-rendered. Review with sparse data returns useful gap-notes rather than erroring. Provider `content_filtered` on review (rare) surfaces M3's standard card. Undo expiry (10 s) simply finalizes — full field history is a noted future, not v1.

## 8. Analytics Events (Umami)

`resume_created` (blank|duplicate) · `resume_deleted` · `section_completed` (which) · `template_switched` (to) · `photo_added` · `export_started` / `export_completed` (template, pages, size) · `floor_block_shown` · `checklist_export_anyway` · `ai_polish_used` (field) / `ai_polish_applied` · `ai_review_used` / `ai_review_suggestion_applied`.

## 9. Acceptance Criteria (module gate)

1. Cap: creation and duplication both blocked at 5 through UI, RPC, and direct-insert attempt.
2. Floor & checklist: exact floor logic verified; checklist lists true gaps; "Export anyway" works; a floor-passing minimal resume exports validly.
3. Template parity: one fixture dataset renders through all four templates; snapshots pinned; ATS Standard passes a **text-extraction order test** (`pdftotext` yields sections in reading order, no photo artifacts).
4. Photo policy: renders on all three styled templates, never on ATS, with the notice chip on switch; signed-URL isolation proven.
5. Polish: alternatives → apply → Undo path; the no-fabrication clause spot-checked against adversarial fixtures ("make me sound more senior" style inputs don't add invented credentials in sampled runs).
6. Review: fixed-shape report renders; jump-to-section and individual Apply work; token estimate shown; keyless state links Settings.
7. Purge: account deletion removes resumes + photo objects (clock-controlled M2 purge test extended here); orphan-sweep verified.

## 10. Module Risks

- **R-M7a — ATS variance:** no builder can guarantee every parser. Mitigations: the deliberately conservative ATS Standard, the extraction CI test, and honest copy (_"designed for ATS compatibility — no tool can guarantee every system"_). No marketing over-claims.
- **R-M7b — `@react-pdf` layout drift** across versions: pinned version + rendered-snapshot CI on all four templates; upgrades are deliberate events.
- **R-M7c — AI embellishment pressure:** the no-fabrication prompt clause + human-applies-everything + the AI chip culture from M3; sampled-run checks in CI (5).

## 11. Open Items (noted futures)

Section reordering · DOCX export · cover-letter companion · per-resume field history/undo depth · public share links (only if the master non-goal is ever revisited).

_End Module PRD 07 · decisions M7-1…M7-6 locked · next: M8 WhatsApp Content Bot — final module._
