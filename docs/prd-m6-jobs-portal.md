# Module PRD 06 — Jobs Portal

|               |                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------ |
| **Module**    | Jobs Portal — curated listings, seeker tools, organization records, Jobs Manager operations      |
| **Version**   | 1.0 · 18 Jul 2026                                                                                |
| **Parents**   | Master PRD v1.5 (§7.7) · M4 (Jobs shell slot) · M2 (saved/applied ownership) · STYLE.md v1.3     |
| **Decisions** | M6-1 … M6-6 — see §2. **M6-2 amends master D14 phasing** (flagged for the master-PRD sync pass). |
| **Phase**     | 3                                                                                                |

## 1. Scope

**In:** the public jobs index & detail pages, filtering (incl. the salary-transparency nudge), the `mailto:` apply path, saved + applied seeker tracking, reusable organization records, the Jobs Manager CMS surface (full CRUD, quick-add, expiry ops), lifecycle automation, and Google-Jobs structured data. **Deferred-but-designed (this doc, §7):** the public employer-submission form and external aggregation — schemas ship now, activation is a feature-flag flip. **Out:** job alerts (arrive with notifications/M8 era), in-platform applications with employer dashboards (master non-goal), public organization pages (noted future).

## 2. Module Decision Log

| #    | Decision           | Choice                                           | Consequence                                                                                                                                                           |
| ---- | ------------------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M6-1 | Apply by email     | **`mailto:` link** — zero infra, address visible | Prefilled subject; copy-address fallback for clientless devices (§4.2). Relay remains a later lever (R-M6b).                                                          |
| M6-2 | Sourcing at launch | **Curated by team via CMS only**                 | _Amends D14 sequencing:_ employer submissions + aggregation defer; `source` enum + `job_submissions` schema ship dormant behind the `employer_submissions` flag (§7). |
| M6-3 | Salary policy      | **Optional + "Salary shown" badge & filter**     | Honest nudge: no ranking boost, just visibility + a seeker filter (§4.5).                                                                                             |
| M6-4 | Organizations      | **Reusable records**                             | `organizations` table; enter logo/description once, attach to many listings (§5).                                                                                     |
| M6-5 | Seeker tracking    | **Saved + "Mark as applied"**                    | Personal tracker with timestamps + optional note; survives listing expiry (§4.4).                                                                                     |
| M6-6 | Location model     | **Curated city list + Remote / International**   | `cities` seed table + `location_mode`; clean filters, no "Lahore/lahore/Lhr" entropy (§4.1, §8).                                                                      |

## 3. User Stories

1. As a final-year student, I filter to _Karachi · Industry · Internship · Salary shown_ and trust every chip means what it says.
2. As a seeker, one tap opens a prefilled application email — or the external form — and one more marks the job **Applied** so my dashboard remembers what I've chased.
3. As a seeker, an expired listing I applied to stays in my history, clearly marked, instead of vanishing.
4. As the **Jobs Manager**, I post a role for an organization we've listed before in under a minute — logo, description, and website already on file.
5. As the Jobs Manager, I quick-add five roles from this week's newspaper scan without fighting a long form, and extend or expire anything in one click.
6. As anyone sharing a job, the WhatsApp preview card looks right, and Google Jobs indexes the listing correctly.

## 4. Public Specification

### 4.1 Index — `/jobs`

Filter bar: **Category** (hospital · community/retail · industry — production/QA/QC/RA/PV · sales & marketing · academia · regulatory bodies · other) · **City** (curated list, M6-6) + **Remote** + **International** · **Type** (full-time · part-time · contract · internship · house job) · **Experience** (entry · 1–3 yrs · 3–7 yrs · senior) · **Salary shown** toggle (M6-3). Sort: newest (default) · expiring soon. Cards: org logo (square, monogram fallback), title, organization, location chip, type chip, `SALARY SHOWN` chip when applicable, posted-ago. Signed-in cards carry the save toggle. Blister-grid layout ≥4 results; honest empty states per filter combination.

### 4.2 Detail — `/jobs/[slug]`

Header: org logo + name + website link · title · location/type/experience chips. **Key-facts record block** (monograph rows — the STYLE stacked-record pattern natively): `TYPE · LOCATION · EXPERIENCE · SALARY (when shown) · POSTED · EXPIRES`. Description: Plate render. **Apply:** external-URL button _or_ `mailto:` (M6-1) with prefilled subject `Application: {title} — via ePharmatica` and a visible **Copy email** fallback (clientless devices). Actions: **Save**, **Mark as applied** (§4.4), **Share** (WhatsApp-first + copy link). `JobPosting` schema.org emitted (§10). Listings expiring in < 7 days show an amber countdown chip.

### 4.3 Lifecycle

Default expiry +30 days (Jobs Manager editable). Cron `jobs-expire` flips status, drops the listing from index/sitemap/structured-data validity; the detail URL then **redirects to `/jobs` with an "expired" notice** (master rule). Extend resets the clock and revalidates. Expired rows remain queryable for seeker history (§4.4) — the redirect is a route decision, not a data deletion.

### 4.4 Seeker tracking (M6-5)

`saved_jobs(user_id, job_id, saved_at, applied_at null, applied_note ≤200)`. **Save** from card/detail; **Mark as applied** stamps `applied_at` (+ optional note: "sent CV via email", ref numbers). Dashboard → **My jobs**: _Saved_ and _Applied_ lists with live/expired chips, unsave/unmark, notes inline-editable. Applied entries persist past expiry and past unsave-of-saved (applied implies tracked). Owner-only RLS.

### 4.5 Salary nudge (M6-3)

Optional `salary_min` / `salary_max` (PKR, monthly, v1 fixed period); either bound alone renders "From PKR X / Up to PKR Y", both render "PKR 120–180k / month" (tabular mono per STYLE §4). Presence ⇒ the `SALARY SHOWN` chip + inclusion under the filter toggle. No ranking manipulation — the nudge is visibility, honestly.

## 5. Organizations (M6-4)

`organizations(id, name, slug, logo_asset_id, website, description ≤400, city_id null)` — managed in the CMS Jobs slot; listing forms use a **picker with inline create** (name-similarity hint warns near-duplicates). Public: an org info panel on each listing; clicking the org chip filters `/jobs?org={slug}`. Public org _pages_ are an explicit future (the slug reserves the URL space). Editing an org updates every listing's panel on next revalidation.

## 6. Jobs Manager Surface (behavior for the M4 shell slot)

- **Listings table:** status filter (published · pending · expired · rejected · archived), expiry column with countdown sort, actions — Edit · **Extend +30d** · **Expire now** · Archive; bulk-extend selection.
- **Create/Edit form:** org picker (+ inline create §5) · title · category/type/experience selects · location (mode → curated city select; Remote hides city; International reveals `intl_location` text) · salary fields (§4.5) · description (Plate) · apply method radio (`url` with validation ping | `email` with format check) · expires (default +30d) · source (locked to `curated` while the flag is off).
- **Quick-add:** the aggregation answer for v1 — a compact single-screen form (title · org picker · city · type · apply URL/email · expiry) built for "five roles from this week's scan in five minutes"; drafts land `published` directly (Jobs Manager is the review).
- **Organizations manager:** CRUD + merge (re-points listings, audited).
- Everything audited via `withAudit` per M4 conventions.

## 7. Deferred-but-Designed (activation = flag flip)

**Employer submissions (`employer_submissions` flag):** public `/jobs/submit` — employer contact (name, email), org fields (matched against §5 or new-pending), listing fields; submit → verification email (tokenized confirm) → row lands `pending` in the M4 Jobs queue → Jobs Manager approves (creates/links org, publishes) or rejects (reason, notify). `job_submissions` stores the raw payload + token state; Turnstile-guarded; rate-limited. **Aggregation:** stays manual via quick-add until listing volume proves automation worth building (explicitly re-decided then). **Alerts:** land with the notifications/WhatsApp era; `saved_jobs` already provides the interest signal.

## 8. Data-Model Deltas

- **add** `organizations` (§5) · **add** `cities(id, name, province)` seeded with major Pakistani cities (admin-growable).
- `jobs`: **replace** free org/location fields with `org_id FK`, `location_mode enum(onsite|hybrid|remote)`, `city_id FK null` (required unless remote), `is_international bool` + `intl_location text null`; **add** `salary_min`, `salary_max` (int, PKR/month), `apply_method enum(url|email)` + `apply_value`; `source` enum retained, default `curated`.
- `saved_jobs`: **add** `applied_at`, `applied_note`.
- `job_submissions` per master, dormant (§7).

## 9. RLS Summary

`jobs`, `organizations`, `cities`: public `select` (jobs regardless of expiry — routes gate presentation; enables seeker history joins); writes `jobs_manager`+ only. `saved_jobs`: owner-only. `job_submissions`: service-role only (public inserts via RPC when the flag activates). CI adds: _non-manager cannot write jobs/orgs_, _owner isolation on saved_jobs_, _submissions unreachable while flag off_.

## 10. SEO & Structured Data

`JobPosting` JSON-LD per listing: `title`, `datePosted`, `validThrough` (expiry), `employmentType` mapping, `hiringOrganization` (org name/logo/site), `jobLocation` (city/PK) or `applicantLocationRequirements` + `jobLocationType: TELECOMMUTE` for remote, `baseSalary` only when shown (min/max, PKR, MONTH). `sitemap-jobs.xml` = live listings only; expiry removes entries and `validThrough` handles crawler lag. Detail pages ISR with tag `jobs` + `job:{id}`.

## 11. Edge Cases & Rules

Duplicate guard: same org + similar title within 30 days → CMS warning (post anyway allowed — repostings are real). Only-min or only-max salary renders correctly (§4.5). Org merge re-points listings and saved/applied rows follow (job-keyed). Applied-then-expired keeps full history; applied-then-_deleted_ (rare admin hard-delete) leaves a tombstone row in My Jobs ("Listing removed"). `mailto:` targets are entered with employer consent as part of curation (recorded in the listing's audit note). Extend after expiry resurrects the URL (redirect lifts on revalidation). International + Remote is invalid (mode wins; form prevents).

## 12. Analytics Events (Umami)

`job_viewed` · `apply_clicked` (method) · `apply_email_copied` · `job_saved` · `job_marked_applied` · `jobs_filtered` (props: which filters, salary_toggle) · `org_chip_clicked` · `job_shared` (channel) · `job_expired` (cron count).

## 13. Acceptance Criteria (module gate)

1. Full curation loop: create org inline → post listing → public within seconds → edit → extend → expire-now → redirect + notice verified; every step audited.
2. Quick-add posts a complete listing in ≤ 6 fields; five-in-five-minutes usability check passes with the Jobs Manager persona.
3. Filters: every chip filters truthfully, incl. the salary toggle and Remote/International; curated-city integrity (no free-text leakage).
4. Apply: `mailto:` prefill correct on mobile + desktop; copy-fallback works; URL method validates on save.
5. Tracker: save → apply → expire retains history with correct chips; notes edit; RLS isolation proven.
6. Structured data passes Google's Rich Results validation for fixtures covering onsite, remote, and salary-shown listings; sitemap reflects expiry within a revalidation cycle.
7. Dormancy proven: with the flag off, `/jobs/submit` 404s and `job_submissions` is unreachable; flipping the flag in staging activates the full §7 path.

## 14. Module Risks

- **R-M6a — supply bottleneck** (curated-only): the portal is only as alive as the Jobs Manager's week. Mitigation: quick-add ergonomics (§6), a weekly listings-posted metric on the M4 dashboard, and the pre-built §7 path as the pressure valve.
- **R-M6b — `mailto:` exposure** (scraped addresses): consent-at-curation + the relay option held in reserve; monitor employer complaints.
- **R-M6c — link rot** on external applies: weekly `link-check` cron flags 404/410 apply URLs to the Jobs Manager (flag, never auto-expire — false positives are common).

## 15. Open Items

Employer-form activation criteria (supply + demand thresholds — founder call). Public organization pages. Alerts opt-in surface (with M8). **Master-PRD sync:** D14 phasing amendment (M6-2) queued for the end-of-series master update.

_End Module PRD 06 · decisions M6-1…M6-6 locked · next: M7 Resume Builder._
