# ePharmatica — Development Plan

|                     |                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------- |
| **Version**         | 1.0                                                                                       |
| **Date**            | 19 July 2026                                                                              |
| **Derived from**    | Master PRD v1.6 · module PRDs M1–M8 · ARCHITECTURE.md v1.1 · STYLE.md v1.3 · legal drafts |
| **Companions**      | `rules.md` (engineering ground rules) · `securities.md` (security program)                |
| **Team assumption** | 1–2 developers + founder/content team (per master PRD §6)                                 |

> **Governance reminder:** module PRDs are authoritative for module-level detail; on conflict with the master PRD §7, the module PRD + master changelog govern. The Decision Log (master §5) wins over ARCHITECTURE.md. This plan is a _sequencing_ document — it never overrides a PRD.

---

## 1. How to read this plan

- Each phase lists **entry criteria** (what must be true to start), **workstreams** with ordered task clusters, and an **exit gate** (acceptance criteria copied from the PRDs — these are hard gates; the next phase does not start until they pass).
- Task clusters use checkboxes for tracking. A cluster is "done" only when its tests, RLS policies, audit hooks, analytics events, and admin surface (where applicable) are done — see the Definition of Done in `rules.md`.
- Module acceptance criteria sections (each `prd-m*.md` §-numbered acceptance list) are the test plans. Do not invent lighter ones.
- Exact numbers (limits, windows, quotas) quoted here are contractual — they come from the PRDs and legal drafts. If a number here disagrees with a PRD, the PRD wins; fix this file in the same PR.

## 2. What we're building

A single Next.js 16 application backed by self-hosted Supabase on one Hetzner EU VPS behind Cloudflare, serving four surfaces: public marketing/learn pages, the authenticated learner app, the community, and the `/admin` CMS. Eight modules ship across five phases:

| Module | What                                                                             | Phase           |
| ------ | -------------------------------------------------------------------------------- | --------------- |
| M1     | Learning platform — reader, highlights, notes, bookmarks, progress, search       | 1               |
| M2     | Accounts & profiles — auth, immutable usernames, 14-day deletion machine, export | 1               |
| M3     | AI study suite — BYOK explain/summarize/chat, key vault, guardrails              | 1               |
| M4     | CMS/admin — shell, editorial workflow, review queue, media, audit, §10 contracts | 1 (progressive) |
| M5     | Community — forum, blog, public profiles, pharmacist verification                | 2               |
| M6     | Jobs portal — curated listings, organizations, saved/applied tracking            | 3               |
| M7     | Resume builder — 5 resumes, 4 templates, client-side PDF, AI polish/review       | 3               |
| M8     | WhatsApp bot — inbound-only, bilingual (English / Roman Urdu), menu + FTS        | 4               |

Strategic posture: content-first, cost-disciplined (~US$15/month infra), BYOK AI (zero platform inference cost), globally usable, monetization-flexible (dormant entitlement layer from Phase 1).

**Repo shape (founder decision, 19 Jul 2026): monorepo.** pnpm workspaces + Turborepo, one deployable app (`apps/web`) plus owned internal packages (`@epharmatica/tokens`, `@epharmatica/ui`, `@epharmatica/editor`, `@epharmatica/database`, `@epharmatica/config`). This changes repo organization only — deployment topology is unchanged (one Next.js container on the VPS). ARCHITECTURE.md §3.2's codemap must be amended to v1.2 in the Phase 0 PR that scaffolds the workspace (see 0.B). Layout:

```
epharmatica/                          # monorepo root — pnpm-workspace.yaml, turbo.json
├── apps/
│   └── web/                          # the single Next.js 16 app (all four surfaces)
│       ├── app/                      # route groups per ARCHITECTURE §3.1
│       ├── features/                 # vertical slices (content, study, ai, forum, …)
│       ├── lib/                      # supabase clients, entitlements, integrations,
│       │                             #   observability — server-boundary code stays here
│       └── e2e/                      # Playwright (runs against this app)
├── packages/
│   ├── tokens/                       # @epharmatica/tokens — Style Dictionary source of
│   │                                 #   truth (tokens/*.json) → CSS @theme, TS constants,
│   │                                 #   Tokens-Studio Figma file
│   ├── ui/                           # @epharmatica/ui — shadcn-owned primitives + the 13
│   │                                 #   system primitives + Storybook
│   ├── editor/                       # @epharmatica/editor — the Plate wrapper (I4):
│   │                                 #   plate config, block schema, <RichText/> renderer,
│   │                                 #   serializers, getTextRuns
│   ├── database/                     # @epharmatica/database — generated types
│   │                                 #   (never hand-edited) + shared Zod schemas
│   └── config/                       # @epharmatica/config — shared tsconfig, ESLint
│                                     #   (incl. I2/I4 no-restricted-imports), Prettier
├── supabase/                         # migrations, RLS tests, seed (repo-level, not a package)
└── docs/                             # PRDs, ARCHITECTURE, STYLE, this plan, runbooks
```

## 3. Master timeline (planning estimate, not commitment)

```
Phase 0  Foundation            2–3 wks   weeks  1–3
Phase 1  Learning MVP          6–10 wks  weeks  4–13
Phase 2  Community             4–6 wks   weeks 14–19
Phase 3  Jobs + Resume         4–6 wks   weeks 20–25
Phase 4  WhatsApp bot          3–4 wks   weeks 26–29
Phase 5  Assessment engine     deferred  re-scope at Phase 3 planning (A3)
```

**Content track (Risk R1) — Q2 resolved (v1.7):** Phase 1 launch requires ≥2 subjects with ≥25 published subtopics through the full review workflow, and the YouTube channel live with initial videos. The founder is the primary author and **most launch content is already written** — so the Phase-1 content work is porting into the CMS (Plate blocks, Drug Cards, callouts, video embeds) plus the review cycle, not greenfield authoring. Team at launch: founder + 1 recruited author + **≥1 external licensed reviewer** (required before the first publish — the workflow forbids self-approval, M4 CI-enforces "author cannot approve own draft", and G6 requires independent medical-accuracy review). The CMS authoring path is still built _first_ inside Phase 1 so porting starts the week it lands.

---

## 4. Phase 0 — Foundation (2–3 weeks)

**Goal:** infra + skeleton + design system + landing page. Everything after this deploys on merge.

**Entry criteria:** domain (epharmatica.com) and Hetzner account ready; GitHub repo created.

### 0.A Infrastructure & ops

- [ ] Provision Hetzner CX33-class VPS (4 vCPU / 8 GB / NVMe, Falkenstein or Nuremberg), Ubuntu 24.04 LTS
- [ ] Security baseline **before anything else**: SSH keys only, fail2ban, UFW default-deny (80/443 + SSH), unattended-upgrades (see `securities.md` §12)
- [ ] Install Coolify; Traefik terminating TLS; only :80/:443 exposed
- [ ] Deploy self-hosted Supabase stack (Postgres 15+, GoTrue, PostgREST, Realtime, Storage + imgproxy, Kong, Studio); Studio + Kong admin bound to a private admin hostname, IP-allow-listed at Cloudflare + UFW
- [ ] Cloudflare: DNS, CDN, TLS, WAF/rate rules; cache-everything for anon on public routes with `Bypass on cookie: sb-*`
- [ ] Deploy Umami (self-hosted, cookieless) and Uptime Kuma
- [ ] Sentry project (client + server), PII scrubbing rules from day one
- [ ] Backups: nightly `pg_dump` (custom format) + weekly base backup + Storage sync → encrypted upload to Cloudflare R2/Backblaze B2, 30-day retention; **run the first restore drill into a scratch container now** (RPO ≤ 24 h, RTO ≤ 4 h)
- [ ] SMTP: Resend/Brevo account wired to GoTrue (verification email works)
- [ ] Create + monitor mailboxes the legal drafts promise: `legal@`, `privacy@`, `support@epharmatica.com` — plus `jobs@epharmatica.com` (interim employer intake, v1.7 decision)

### 0.B Monorepo skeleton & CI/CD

- [ ] Scaffold the **monorepo**: pnpm workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`) + Turborepo (`turbo.json` task graph: `build`, `lint`, `typecheck`, `test` with dependency-aware caching); Node 22 LTS pinned via `.nvmrc` + `engines`
- [ ] `packages/config`: shared strict `tsconfig`, flat ESLint config (incl. the I2/I4 `no-restricted-imports` rules for service-role isolation and `slate*`/`@udecode/*`), Prettier — every workspace extends these, none redefines them
- [ ] `apps/web`: Next.js 16 (latest 16.2.x), TypeScript 5 strict; **no custom webpack config ever** (Turbopack default); route groups + `features/` + `lib/` per ARCHITECTURE §3.1–3.3
- [ ] `packages/database`: generated Supabase types (never hand-edited) + shared Zod schemas; internal packages consumed via workspace protocol and transpiled by the app build — no publish step, single deployable
- [ ] Amend **ARCHITECTURE.md §3.2 codemap → v1.2** in this same PR (monorepo layout; invariants and deployment topology unchanged) per its own §10 change rule
- [ ] Husky/lint-staged + Conventional Commits at the repo root
- [ ] Supabase CLI local stack + seed script (demo content, one user per role)
- [ ] GitHub Actions PR pipeline (Turborepo-cached, affected-only where safe): install → Prettier → ESLint → `tsc --noEmit` (all workspaces) → type-drift check (`supabase gen types` into `packages/database` must produce no diff) → Vitest → build → Playwright smoke
- [ ] Merge-to-main pipeline: `turbo build` → image build (`apps/web` standalone output) → Coolify webhook deploy → gated migration step (automatic pre-migration dump) → smoke ping → Sentry release + sourcemaps
- [ ] Staging environment: second compose project on the same VPS, basic-auth-gated, deploys from `develop`
- [ ] Environment variables per master Appendix A, secrets only in Coolify env store

### 0.C Design system & tokens (STYLE.md §16, S11)

> **UI reference (added 19 Jul 2026, founder-supplied):** `docs/design/` holds the design canvases from the claude.ai/design project "CMS and Public Site Wireframes":
>
> - `epharmatica-wireframes.dc.html` — **every product screen** (1a–1bg): learn tree, reader (3 variants), gate, search, dashboard, auth, settings, AI suite, community, blog, profiles, verification, jobs, resume, WhatsApp flow, and all CMS surfaces incl. Move…, preview links, media library, queues, and consoles. Each phase implements its screens from these wireframes.
> - `epharmatica-ui-mockups.dc.html` — hi-fi mockups: landing (2a — the 0.E spec), reader desktop/mobile (2b/2d), dashboard (2c), CMS editor + review (2e/2f), community thread (2g), jobs (2h/2i), resume builder (2j), plus full-coverage hi-fi + dark-mode turns.
>
> Both share the Pharmacopoeia tokens. Precedence: STYLE.md wins on token values; the mockups/wireframes win on composition and layout; PRD acceptance criteria win on behavior.

- [ ] `packages/tokens` (@epharmatica/tokens): Style Dictionary pipeline — `tokens/*.json` is the single source of truth → CSS `@theme` block, TS constants, Tokens-Studio file for Figma. Tokens are edited only in JSON; `apps/web` and `packages/ui` consume the build outputs
- [ ] Tailwind v4 `@theme` with the locked Pharmacopoeia tokens: all `--color-*` (paper/surface/ink/ink-2/line/primary/primary-strong/primary-tint/on-primary, ok/warn/danger, hl-amber/mint/lilac/rose), `--radius-*: 0px` (immutable, S1), fonts, breakpoints (sm 480 / md 768 / lg 1024 / xl 1200), z-scale (sticky 100 · dropdown 200 · overlay 300 · dialog 400 · toast 500), plus `.dark` values
- [ ] `packages/ui` (@epharmatica/ui): shadcn/ui config with `--radius: 0rem`; components owned in-repo (shadcn CLI targets this package); hover styles behind `@media (hover:hover)`; touch sizing behind `@media (pointer:coarse)` (44px targets)
- [ ] Self-host fonts via `next/font` in `apps/web`: Archivo, Instrument Sans, IBM Plex Mono
- [ ] Build the 13 system primitives in `packages/ui`: MonographLabel, BlisterGrid, StateGlyph, ProgressStrip, Stamp, SelectionPopover, ActionBar, StackedRecord, OfflineBanner, Toast, TextSizeControl, ReadingBar, WaitlistForm
- [ ] `/dev/system` internal route in `apps/web` rendering every primitive in both themes against live tokens (admin-gated) — **week one**
- [ ] Storybook initialized inside `packages/ui`, one story per primitive (the deferrable half under time pressure)
- [ ] RTL conventions from the first component: logical properties only (`ms-/me-/ps-/pe-`, `text-start/end`), `dir` plumbed via next-intl; all strings through next-intl from day one (English-only catalog)
- [ ] next-themes light/dark/system; theme-color meta per theme; PWA safe-area metadata
- [ ] Figma pass: logo + figure-kit against the tokens

### 0.D Database foundation (master Appendix C, migrations 001–010)

Forward-only, each paired with regenerated types + RLS tests (I7):

- [ ] 001 extensions (pgcrypto, pg_trgm) + helpers (`has_role()`, `is_sanctioned()`, `can_feature()` — security definer)
- [ ] 002 profiles + auth trigger
- [ ] 003 plans / entitlements / feature_flags (+ `can(user, feature)` server gate in `lib/entitlements`)
- [ ] 004 content tree (subjects → chapters → topics → subtopics; note M1 deltas: `topics.description varchar(280)`, `subtopics.primary_video_url`, `preview_block_count` — no short/long_video_url columns)
- [ ] 005 revisions + review events + slug_history (with `level` + parent path snapshot)
- [ ] 006 study data (highlights with typed anchor jsonb v:1, bookmarks, user_notes, progress, last_visited)
- [ ] 007 ai_keys + ai_rate_limits
- [ ] 008 waitlist_signups + audit_log (append-only: RLS + revoked update/delete)
- [ ] 009 FTS columns/indexes/triggers (search_vector: A title / B headings / C body)
- [ ] 010 storage buckets + policies (`content-media`, `avatars`, `verification-docs` private, `covers`)
- [ ] RLS test harness in CI (shadow DB, SQL assertions) — first probes: anon cannot read unpublished subtopics; user A cannot read user B's rows
- [ ] `personal_data_registry` + CI check that every table containing `user_id` is registered (M2 R-M2b guard)

### 0.E Landing page & waitlist

- [ ] Landing per §7.1: split hero (S4) — statement block beside live demo of real system primitives; stacks statement-first on mobile
- [ ] Feature sections for all six modules; unreleased ones carry Coming Soon ribbon driven by feature flags
- [ ] Waitlist form (S12): email + module-of-interest select + role select (**Student / Professional / Other** — exact S12 label set; supersedes master §7.1's "pharmacist" wording, flag for master-PRD sync) → `waitlist_signups`; success replaces form with stamp chip `ON THE LIST · {date}`; Turnstile-guarded
- [ ] Legal routes live: `/terms`, `/privacy`, `/content-policy`, `/medical-disclaimer`, `/about`, `/contact`. Counsel review **complete** (founder confirmation, 19 Jul 2026). Before the pages go live: fill the bracketed fields still present in the drafts (effective dates, legal entity + registered address, jurisdiction city, liability cap, R2-vs-B2 and Resend-vs-Brevo picks) and remove the DRAFT headers
- [ ] Static/ISR; OG image route; sitemap + robots

### 0.F Content track (parallel — Q2 resolved: founder primary author, most content pre-written)

- [ ] Write the content style guide + Drug Card conventions (structure, callout usage, citation norms, semester-mapping method) — this is what the reviewer reviews against, and the porting template for existing material
- [ ] **Recruit 1 author + ≥1 external licensed reviewer** (hospital pharmacist or academic, per-review stipend) — the reviewer is required before the first publish; the workflow forbids self-approval
- [ ] Create the YouTube channel week one: branding from the Figma pass, upload pipeline, cadence commitment (target: 2 shorts/week)
- [ ] Map the existing written material onto the Subject → Chapter → Topic → Subtopic hierarchy (Pharmacology + Pharmaceutics first, A8) so porting into the CMS starts the week 1.B lands

### Phase 0 exit gate (master §6)

- Deploy-on-merge works end to end
- Backup restore drill passes on a scratch database
- Landing scores ≥90 Lighthouse performance/SEO/accessibility on mobile
- (Content track, parallel) YouTube channel created, branding done, video pipeline started — must be live with initial videos **before Phase 1 launch**; author + reviewer recruited; existing material mapped onto the content hierarchy

---

## 5. Phase 1 — Learning Platform MVP (6–10 weeks)

**Goal:** content model + CMS authoring + review workflow + public reader with previews + accounts + study tools + BYOK AI + dormant entitlements.

**Entry criteria:** Phase 0 gate passed, including the content-track items (author + reviewer recruited, existing material mapped onto the hierarchy).

**Build order rationale:** CMS authoring first (unblocks the content team — the true critical path), then public reader, then study tools, then AI. Auth core early because everything else hangs off identity.

### 1.A Accounts core — M2 (first half)

- [ ] Email sign-up: email, password (min 10 chars, zxcvbn ≥2, no composition rules), username (live availability + "permanent" notice), display name, required 13+ checkbox; Turnstile; verification email → banner
- [ ] Google OAuth via GoTrue with mandatory first-time completion step (username + user type + 13+ checkbox); profile row created only on completion; both paths return the user to their pre-auth location
- [ ] Username system (M2-1): 3–20 chars, `a–z 0–9 _ -`, start/end alphanumeric, lowercase-canonical, case-insensitive unique; `reserved_usernames` seeded (admin, api, app, auth, blog, community, dev, epharmatica, help, jobs, learn, legal, resume, search, settings, support, system, u, verify, whatsapp); `handle_quarantine` (90 days) for admin force-renames
- [ ] Identity auto-linking (M2-4): only when **both** sides have verified email; unlink requires another method to remain; all link/unlink events emailed
- [ ] Profile fields + avatar pipeline (client square-crop → WebP 512px ≤1 MB → server type-sniff → `avatars` bucket, write-then-swap)
- [ ] Settings IA: `/settings/{profile, appearance, ai-keys, data, sessions}`; `profiles.prefs jsonb {theme, text_size}` read by reader surfaces
- [ ] Sign out everywhere (global refresh-token revocation, e2e-tested on two live contexts)
- [ ] Auth rate limits + audit events (hashed IP) — full catalog in `securities.md` §10
- [ ] `profiles.visibility` enum ships now, default `unset` (prompt activates in Phase 2, M2-6)

### 1.B CMS shell + authoring — M4 (content team unblocked here)

- [ ] `/admin` shell: proxy.ts role gate + per-page permission map + RLS (three layers); left nav (Dashboard, Content, Media, Users, Settings, Audit; later groups behind flags); compact density; staging banner; noindex; stricter rate limits. **CMS stays in-app (v1.7 re-confirmation of §7.10 — no separate admin deployment)**
- [ ] Cloudflare Access policy (or IP allowlist) on `/admin/*` at the edge — the optional fourth defense layer (v1.7), same treatment Supabase Studio gets; zero RAM cost
- [ ] Content tree rail + list editors (M4-1); metadata forms with shared Zod schemas; auto-slug (locked once anything beneath is published; rename → slug_history consequence sheet + 301)
- [ ] **Move…** cross-parent flow (M4-1/§5.3): destination picker (legal targets only) → consequence sheet (old→new URL + 301 note, "N highlights will re-anchor", cache scope, sitemap effect) → typed `move` confirmation for published nodes → executes atomically (reparent + slug_history rows + tag invalidations + enqueue re-anchor job); drafts move without ceremony
- [ ] Subtopic editor: full Plate config per M1 contract — headings, marks, lists, tables, 5 callouts (Definition / Clinical Pearl / Mnemonic / Exam Alert / Warning), image via media library picker, YouTube embed block (URL validated at save), code block, TOC block, **Drug Card** block; autosave 30s + on blur; comments/suggestions on
- [ ] `packages/editor` (`@epharmatica/editor`) wrapper built **first** — product code never touches Slate directly (I4; the monorepo makes this a real package boundary: only this package lists `slate*`/`@udecode/*` as dependencies); `<RichText/>` read renderer + renderer snapshot tests across the block schema
- [ ] Editorial workflow: draft → in_review → changes_requested → approved → published (+ archived); revision snapshot on submit and on publish; rollback = new revision via rendered side-by-side diff; every transition → `content_review_events` + `audit_log` via `withAudit()` (I8)
- [ ] Publish pipeline: snapshot → derive `primary_video_url` (first video block) + reading time (`ceil(words/200)`, min 1) → status flip → `revalidateTag` cascade (subtopic + ancestors + sitemap) → audit → enqueue re-anchor job
- [ ] Review queue (M4-2): single open queue, oldest first, claims via `review_claims`, age chip amber >7 days
- [ ] Draft preview links (M4-4): 128-bit token hashed, 7-day expiry, 30 opens/hr/IP, DRAFT watermark, auto-revoke on publish, opens logged
- [ ] Media library (M4-3): PNG/JPG/WebP, type-sniffed, auto-WebP (max edge 1920, ≤2 MB), **alt text required**, usage tracking via `media_refs`, delete blocked while referenced, replace-in-place keeps asset id
- [ ] Users admin: search, role assignment (rank rules; super_admin only by super_admin with typed confirmation), force-rename per M2 contract, read-only deletion-grace list
- [ ] Settings: feature-flags editor (with phase tags; flips audited + bust `flags` tag), `ai_models` registry editor + M3's admin analytics rendering (both halves of the M3 §13 contract), site metadata, reserved-usernames editor, personal-data registry viewer
- [ ] Audit log surface: filterable, entity deep-links, CSV export; 12 months hot → yearly R2 export cron → prune
- [ ] Staff TOTP 2FA fully built via GoTrue MFA (enforcement off — M4-5; staff passwords min 12 chars + zxcvbn ≥3; sign-in notifications)
- [ ] Dashboard v1: content counts vs Phase-1 gate, queue depth, last 20 audit entries

### 1.C Public reader — M1 (first half)

- [ ] `/learn` route tree (5 levels) + `/search`; slugs unique per parent; slug_history 301s at every level; canonical = full 4-segment path
- [ ] Topic overview page (M1-1): description ≤280 chars, progress strip, blister list, Continue → first incomplete published subtopic; overview exists even for single-subtopic topics
- [ ] Subtopic reader: mobile-first layout per M1 §5.2 (chip sub-nav, monograph title block, 2px reading bar, prev/next traversal skipping drafts, bottom action bar on mobile)
- [ ] Video: author-placed embed blocks → lite YouTube facade, click-to-load, `youtube-nocookie.com`, mandatory caption (a legal obligation, not just style)
- [ ] Preview gating (D8/I3): **server-side truncation** in `features/content/queries.ts` — anonymous payloads contain only the first `preview_block_count` blocks (default: up to first heading after index 0, capped at 5; author override min 1); verified at the network layer; SEO metadata from title + preview only
- [ ] Visibility cascade (M1-6): one recursive read-query rule (≥1 published descendant), not parent status flags; unpublish → 302 to topic overview with "This unit is being revised."
- [ ] ISR + cache tags per M1 §8: `subtopic:{id}`, `topic:{id}`, `chapter:{id}`, `subject:{slug}`, `sitemap`; Cloudflare shortens the path (tags are the source of truth)
- [ ] "Report an issue" button on every subtopic page (medical-disclaimer obligation, feeds R4)

### 1.D Study tools — M1 (second half; hardest code in the phase)

- [ ] Universal typed highlight anchors (M1-4): anchor jsonb v:1, kinds prose/table/drugcard/code/caption; all text access via `@epharmatica/editor` `getTextRuns(path)`; 4 colors; max selection 1,000 chars; overlaps split, newest wins
- [ ] Re-anchoring post-publish job with normative precedence: exact-keep → same-block re-path → unique-elsewhere move (`moved=true`) → `orphaned=true`; orphans surface in My Highlights, never silently vanish; exhaustive per-block-kind fixture suite in CI
- [ ] `highlight_kinds` feature flag (can restrict to prose-only in production without schema change)
- [ ] Notes (M1-5): one table, two surfaces (inline glyph popover/sheet + drawer); popover→Note creates highlight+note atomically; delete prompts once for both
- [ ] Bookmarks (subtopic + topic); progress mark/unmark with stamp (roll-ups computed at read time, no denormalized counters); `last_visited` upsert powering dashboard Continue
- [ ] Dashboard: continue-studying, progress by subject, recent highlights/notes, bookmarks
- [ ] Search (`/search`, dynamic): Postgres FTS, `websearch_to_tsquery`, min 2 chars, 300 ms debounce, top 20, subject/semester filters; zero per-user query storage
- [ ] Umami event taxonomy per M1 §10 (constants in `lib/observability/events.ts`)

### 1.E AI study suite — M3

- [ ] `AiProvider` adapter layer over Vercel AI SDK: OpenAI, Anthropic, Gemini, OpenRouter, Groq; per-provider error-mapping tables with contract tests against recorded fixtures
- [ ] `POST /api/ai` streaming proxy (SSE): session check → sliding-window rate limits → key resolution (device-only: request header; sync: transient sealed-box decrypt with `AI_KEYS_ENCRYPTION_KEY`) → grounded prompt → stream → nothing persisted (I6)
- [ ] Key management `/settings/ai-keys`: two storage modes (device-only default in IndexedDB; sync = libsodium sealed-box server-side), masked after save, 1-token validation call on save, instant revoke; switching to device-only deletes the server copy immediately; `ai_keys` reachable **only** via security-definer RPCs (status returns masked tail only)
- [ ] `ai_models` registry (DB-driven, admin-edited): picker + Advanced custom model-ID free-text with exact warning copy
- [ ] Explain (selection popover, ≤180 words, quick actions Simpler / Example / Mnemonic / Quiz me), Summarize (pinned shape: KEY POINTS ≤6 · MUST-KNOW TERMS · EXAM ANGLES ≤3), Chat (subtopic context; "Include whole topic" toggle with token estimate `≈ chars/4`, hard guard 150k chars; sessionStorage history per subtopic)
- [ ] Save-to-notes with provenance (`source: 'ai'`, `source_label: '{provider} · {model}'`; AI chip; M2 export gains `source` field)
- [ ] Spend guardrails (M3-4): output tokens default 1,024 (256–4,096); daily requests default 100 (20–500, no unlimited); burst 30 req / 5 min; exact cap/truncation copy from the PRD
- [ ] Failure taxonomy: invalid_key · quota_exceeded · model_not_found · provider_rate_limited · content_filtered · network · unknown; recovery sheet (switch model/provider/retry) without losing chat history
- [ ] Persistent AI disclaimers on every surface; output rendered as markdown text only — never executed, no tools (prompt-injection posture)
- [ ] First-run BYOK wizard with per-provider "how to get a key" guides; Groq/Gemini surfaced first (verify current free-tier terms at build time — R3)

### 1.F Accounts completion — M2 (second half) + legal obligations

- [ ] Deletion state machine (M2-2): consequence sheet → re-auth → T0 (flag set, all sessions revoked, email with purge date + cancel link) → 14-day grace (sign-in auto-cancels) → day-14 `purge-deleted-accounts` cron with **contractual purge order**: (1) ai_keys (2) study data (3) module-owned personal rows (4) waitlist by email (5) storage objects (6) public contributions → "deleted user" sentinel (7) profiles + GoTrue user; idempotent; writes `deletion_receipts` (no PII)
- [ ] Study-data export (M2-5): `epharmatica-export-YYYY-MM-DD.json`, 3/day/user, schema per M2 §4.9 (fixture must include an orphaned highlight with note)
- [ ] Eight transactional emails (HTML + text, monograph-styled, zero marketing) — all render and send in staging
- [ ] 7-day unverified + zero-activity account cleanup cron
- [ ] Unverified accounts: can read gated content and set progress; cannot post to community or auto-link
- [ ] Entitlements dormant but wired: every premium-candidate surface (AI, resume templates later) calls `can(user, feature)` server-side (I5)

### 1.G Hardening & launch prep

- [ ] Full RLS CI suite green (catalog in `securities.md` §5)
- [ ] Playwright smoke: auth (both paths), reader, anon preview gate at network layer, AI against mock adapter
- [ ] Performance budgets on mid-range Android / throttled 4G: reader LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, JS ≤ 200 KB gz on reader routes (editor/admin code-split away); Lighthouse CI on landing + one reader page
- [ ] Accessibility pass: WCAG 2.1 AA, keyboard map (`?`, Cmd/Ctrl K, `[`/`]`, C, N, H, Esc), focus visible, contrast both themes, reduced-motion
- [ ] Legal launch checklist (see `securities.md` §16): counsel review complete ✅ — remaining: bracketed fields filled, DRAFT headers removed, mailboxes monitored, policy-promised features shipped
- [ ] Seed content: ≥2 subjects (Pharmacology + Pharmaceutics per A8) with ≥25 published subtopics through the real review workflow — ported from the founder's existing material, external reviewer approving; porting starts the week the CMS lands

### Phase 1 exit gate (master §6 + module gates)

- ≥2 subjects with ≥25 published subtopics end-to-end through the review workflow
- A signed-in user can highlight, note, bookmark, complete, and use all three AI features with at least 2 providers
- Preview gating verified logged-out **at the network layer**
- RLS test suite passes
- Module gates: M1 §11 (highlight fixtures across every block kind, republish keep/re-path/move/orphan proofs), M2 (both auth paths, deletion machine clock-tested, export fixture, 8 emails), M3 §11 (streaming against 2 live providers + mock, log-audit fixture proves zero key/content leakage), M4 (full authoring loop with cache tags + audit, Move… on a published subtopic — 301 verified + re-anchor job ran + tags fired, claim collision, preview-link auto-revoke)

---

## 6. Phase 2 — Community (4–6 weeks) — M5

**Goal:** hybrid forum, editorial blog, public profiles, Verified Pharmacist flow, notification center.

**Entry criteria:** Phase 1 gate passed. Content policy published. Moderator(s) identified.

### 2.A Data layer & anonymity boundary first

- [ ] Community migrations: threads (+ `is_anonymous`, `locked_reason`, derived `answered`), replies (+ `edited_at`, `tombstoned`), post_revisions, votes, subscriptions, notifications, categories (seed 7 incl. Article Discussions), tags, reports, user_sanctions
- [ ] **Security-barrier views `threads_public` / `replies_public`** as the only public read path (null author identity when anonymous); base-table select revoked from anon/authenticated; the five non-negotiable CI probes (M5 §10) written before UI
- [ ] Sanction enforcement at RLS (`is_sanctioned()`), not just UI

### 2.B Forum

- [ ] Composer (Plate-lite), thread types Discussion/Question, title 15–140 chars, ≤5 tags; posting gate = verified email (M5-1) stacked with <24h account limits (2 threads + 10 replies/day)
- [ ] Anonymity for Question threads only (M5-4): permanent, "Anonymous student" rendering, OP badge, moderators see identity in queue; `anon_questions` policy flag
- [ ] Replies (flat, quote-reply), upvotes (replies only, retractable, aggregate-only), accepted answers via RPC (works for anonymous OPs), default sort accepted → upvoted → chronological
- [ ] Edit windows (M5-2): 15 min silent; after that, "edited" badge + public `post_revisions` history (boundary tests at 14:59 / 15:01)
- [ ] @mentions with `@username` autocomplete (mention notifications are one of the four notification-center kinds; anonymous-OP mentions mask the actor)
- [ ] Locks (reason required, no auto-lock ever) + pins (max 3/category); subscriptions + notification center (4 kinds: reply / mention / accepted / moderation — in-app only, channel-agnostic table)
- [ ] Browsing: recent-activity feed, Unanswered spotlight, category pages, forum FTS respecting anonymity masking
- [ ] Reports → M4 moderation queue slot; full loop: report → queue → action (dismiss/hide/delete/warn/mute 1/7/30d/ban) → audit; appeals workflow (14-day window, different-staff review) per content policy

### 2.C Blog

- [ ] Writer applications (motivation ≤600 chars, sample, credentials) → M4 Blog slot → approve grants `blog_writer`; reject = reason + 30-day reapply
- [ ] Authoring: full Plate, cover (alt required), excerpt ≤160 chars, personal/team bylines (M5-3); workflow draft → in_review → published with scheduling cron
- [ ] Public: `/blog` grid, post page (reading bar), author pages, related posts, Article JSON-LD + OG; comments permanently off — "Discuss in forum" creates the linked thread exactly once
- [ ] Post-publish edit re-review rule (beyond-trivial threshold)

### 2.D Profiles & verification

- [ ] `/u/[username]` honoring the M2 visibility contract; Activity (latest 50, non-anonymous only) + Posts tabs; study data never public
- [ ] **Activate the M2-6 one-time visibility prompt** for existing `unset` users (blocking modal, equal-weight buttons); new signups choose in onboarding
- [ ] Verified Pharmacist (D11): `/verify-pharmacist` form, doc upload ≤5 MB pdf/jpg/png sniffed → private bucket; M4 Verifications slot (support role, signed URLs); approve/reject + reason; 90-day doc purge cron (clock-tested); badge rendering everywhere except anonymous content; revocable
- [ ] M2 deletion flow extended: public contributions → "deleted user" sentinel; pre-deletion option for full post removal; M5 rows registered in `personal_data_registry`

### Phase 2 exit gate

- Full moderation loop demonstrable (report → queue → action → audit log)
- Writer application → approval → draft → review → publish loop completes
- Badges render across forum/blog/profile
- M5 §10 CI probes pass (incl. PostgREST anonymity probing fixture)
- Zero community emails in a full e2e run (in-app only, M5-5)
- Cold-start seeding: 20 staff-seeded threads across categories

---

## 7. Phase 3 — Jobs Portal + Resume Builder (4–6 weeks) — M6 + M7

**Goal:** curated jobs portal with lifecycle automation; resume builder with client-side PDF export. Re-scope Phase 5 (assessment) at this phase's planning per A3.

**Entry criteria:** Phase 2 gate passed. Jobs Manager role staffed.

### 3.A Jobs — M6

- [ ] Migrations: organizations, cities (seeded, admin-growable), jobs (org FK, `location_mode` onsite/hybrid/remote, `city_id` FK null — required unless remote, `is_international bool` + `intl_location text null`, salary min/max PKR/month, `apply_method` enum url/email + `apply_value`, source enum default `curated`), saved_jobs (+ `applied_at`, `applied_note` ≤200), job_submissions (dormant)
- [ ] Jobs Manager CMS surface in the M4 shell slot: listings table (expiry ops, bulk-extend), create/edit form, org manager (CRUD + audited merge), **quick-add** (≤6 fields, publishes directly — the v1 aggregation answer)
- [ ] Public `/jobs` index (truthful filters incl. Remote/International, curated city list, SALARY SHOWN toggle, blister grid ≥4 results) + `/jobs/[slug]` detail (stacked-record key facts, amber countdown <7 days, share buttons — WhatsApp-first + copy link)
- [ ] Apply path (M6-1): external URL (validated on save) or `mailto:` with exact subject `Application: {title} — via ePharmatica` + copy-email fallback; employer consent recorded in audit note
- [ ] Lifecycle: `jobs-expire` cron (+30-day default, editable) — status flip, index/sitemap/JSON-LD removal, detail redirects to `/jobs` with expired notice; extend resets; weekly `link-check` cron flags dead apply URLs (never auto-expires)
- [ ] Seeker tracking (M6-5): save + Mark-as-applied (+note); Dashboard → My jobs; applied entries persist past expiry/unsave; tombstone on hard delete
- [ ] SEO: JobPosting JSON-LD (TELECOMMUTE mapping for remote, baseSalary only when shown), `sitemap-jobs.xml`, Google Rich Results validation on onsite/remote/salary fixtures
- [ ] Employer submissions ship **dormant** behind `employer_submissions` flag (form 404s, table unreachable while off); staging flag-flip must activate the full path (AC7)
- [ ] Interim employer intake (v1.7): "Hiring? Email your listing to `jobs@epharmatica.com`" on the `/jobs` surface (and on the landing's Jobs Coming-Soon section pre-Phase-3); Jobs Manager triages the inbox via quick-add; consent to publish the apply email recorded in the listing's audit note

### 3.B Resume builder — M7

- [ ] `resumes` table (versioned `data jsonb` v:1), cap **exactly 5** per user via security-definer RPC + trigger (UI, RPC, and direct-insert all tested)
- [ ] Hub + builder: left-rail section nav with state glyphs, live paged preview (Form⇄Preview toggle below lg), autosave 1.5 s + blur
- [ ] 9 fixed sections with the PRD's field limits (headline ≤80, summary ≤600, links ≤4, edu bullets ≤4, exp bullets ≤6, skills ≤20, Additional title ≤40, references ≤3); empty sections auto-omit; Personal never hidden
- [ ] Completeness meter (weights: Personal 20 · Education 25 · Experience 25 · Summary 10 · Licenses 10 · Skills 10) + hard export floor (name + one contact) + pre-export checklist sheet
- [ ] Four templates (ATS Standard default — no photo ever; Monograph teal; Slate graphite; Classic navy); accents fixed; template switch never mutates data
- [ ] Client-side PDF via pinned `@react-pdf/renderer`: A4 default + US-Letter, true text layer, `pdftotext` reading-order CI test on ATS Standard, rendered-snapshot CI on all four templates; server never sees a rendered resume
- [ ] Photo: private bucket `resume-photos/{user_id}/{resume_id}.webp`, styled templates only, signed-URL client fetch at export, deleted with resume + weekly orphan-sweep cron
- [ ] AI polish + review via the M3 proxy (features `polish` / `review`): consent line per resume, 2 alternatives + keep-original, 10 s undo, **no-fabrication hard clause** with sampled adversarial CI runs; review report fixed shape; photo excluded from serialization
- [ ] Register resumes + photos in the purge registry; clock-controlled purge test

### Phase 3 exit gate

- An employer submission reaches publication only via Jobs Manager approval (verified via staging flag-flip); expired jobs auto-hide; extend-after-expiry resurrects
- Exported PDF passes text-extraction (selectable text, correct reading order) on the ATS template
- M6 ACs 1–7 and M7's 7-item acceptance gate pass
- Quick-add usability check: five roles in five minutes with the Jobs Manager persona

---

## 8. Phase 4 — WhatsApp Content Bot (3–4 weeks) — M8

**Goal:** inbound-only bilingual bot on a dedicated number; alert-interest capture; CMS console.

**Entry criteria:** Phase 3 gate passed. **Re-verify Meta's pricing for user-initiated service conversations** (R7/R-M8a — a phase gate, not a task). Dedicated number acquired (SIM stored securely offline). Native Roman-Urdu reviewer lined up (launch gate R-M8b).

- [ ] Meta Business setup: number registration, display profile, webhook `/api/whatsapp/webhook` (GET verify token; POST `X-Hub-Signature-256` verification)
- [ ] Data: wa_contacts (phone_hash pk + phone_encrypted, lang, opt_in_alerts, do_not_contact), wa_sessions (24 h resume window), wa_messages (wamid-unique, 90-day purge cron; the purge cycle also nulls `phone_encrypted` for contacts with no activity in 90 days and no active alert opt-in — the Privacy Policy scopes the encrypted copy "solely for reply routing"); _\*zero anon/authenticated access to any wa_* table_* (CI-probed); console via staff RPCs with masking
- [ ] Intent router: state machine + M1 FTS, **no LLM** (D15); bilingual catalogs (en, ur-latn ~30 strings each, code-owned, native-reviewed); universal keywords MENU / LANG / STOP / START
- [ ] Flows: topic search (top 3 buttons, summary + study link + video link iff `primary_video_url`), latest 3 blogs, newest 5 jobs (expired-race fallback), about, job-alert interest (exact registration-not-activation copy), human handoff (support@ + reference code, flags session)
- [ ] Rate limit 30 inbound/hr/contact (one notice then silence); wamid idempotency; edge cases per M8 §7 (media → "text only", groups ignored, blocked users silent)
- [ ] All outbound through `lib/integrations/whatsapp.ts` only (I10); `wa_bot_enabled` kill-switch flag (flips within one revalidation)
- [ ] CMS console (M4 slot): masked sessions list ('+92 ••• ••34'), transcripts with audited unmask (`wa_phone_revealed`), stats strip (server-side aggregates — **no Umami** for this module), kill-switch, catalog read-only view
- [ ] WhatsApp privacy note published

### Phase 4 exit gate

- End-to-end user-initiated conversation on the production number
- **Zero business-initiated sends** in the outbound log (inbound-only is an architectural property — no code path capable of _unsolicited_ sends exists; replies only, via `lib/integrations/whatsapp.ts`)
- Logs visible in CMS; session staleness tested at 23:59/24:01; STOP/START honored; retention cron clock-tested
- Module gate: **all M8 §9 acceptance criteria** pass — video line present/absent per `primary_video_url` fixtures; exact registration-not-activation alert copy; handoff reference code + flagged filter + phone reveal writes the audit row; 31st message in the hour gets the notice, 32nd gets silence, all logged; wamid duplicate-delivery processes once; kill-switch flips within one revalidation; `wa_*` tables unreachable from any non-service credential

---

## 9. Phase 5 — Assessment Engine (deferred)

Practice MCQs per topic, attempt history, weak-area surfacing. **Re-scope at Phase 3 planning (A3)** — pull earlier only if learning-retention metrics demand it. Plug-in point already designed: new `assessment` feature slice + tables; reader integration via existing subtopic IDs (ARCH §9). M3's Quiz-me quick action is the zero-cost preview of this phase.

---

## 10. Continuous tracks (all phases)

| Track                                    | Cadence / notes                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Content production + YouTube channel** | R1 track. Q2 resolved: founder primary author (most launch content pre-written; work = porting + review) + 1 recruited author + ≥1 external reviewer; channel live with initial videos before Phase 1 launch, cadence target 2 shorts/wk; ≥2 complete subjects before public launch; add authors under reviewer supervision when volume demands |
| SEO                                      | Sitemaps (content/blog/jobs), schema.org, OG images, slug_history 301s — ship with each surface, audit monthly                                                                                                                                                                                                                                  |
| Performance budgets                      | Lighthouse CI every PR (warn <90); real-device check on mid-range Android per phase                                                                                                                                                                                                                                                             |
| Accessibility                            | AA floor on every new surface; keyboard + screen-reader pass per phase gate                                                                                                                                                                                                                                                                     |
| Security patching                        | `pnpm audit` + Renovate weekly; Docker images pinned, monthly patch window; Supabase upgrades on scratch clone first, snapshot before                                                                                                                                                                                                           |
| Restore drills                           | Monthly, calendar-enforced, into a scratch container                                                                                                                                                                                                                                                                                            |
| Business-model review                    | Quarterly (R8) — entitlement layer keeps it a switch, not a refactor                                                                                                                                                                                                                                                                            |

## 11. Cross-module dependency map

Contracts that must exist before dependents start (build in this order within each phase):

```
STYLE tokens + primitives (P0)
  └─▶ every UI surface

Migrations 001–010 (P0)
  └─▶ everything

M2 auth core ──▶ M1 study tools · M4 roles · M3 keys · M5 gates · M6 saved · M7 resumes
M4 @epharmatica/editor + publish pipeline ──▶ M1 reader content · M5 blog/forum composers · M6 descriptions
M1 content contract (primary_video_url, preview, anchors, FTS) ──▶ M3 grounding · M8 topic flow · OG cards
M3 §13 proxy contract ──▶ M7 polish/review · (M8: no LLM in v1, future gate)
M4 §10 shell contracts (queues, flags, withAudit) ──▶ M5 · M6 · M8 admin slots
M2 §4.7 purge registry ──▶ every module adding user_id tables (CI-enforced)
M2 §4.10 visibility contract ──▶ M5 public profiles
M5 blog + M6 jobs live data ──▶ M8 blogs/jobs flows
```

## 12. Platform inventories (accumulate as phases land)

**Feature flags:** module Coming-Soon toggles · `highlight_kinds` (M1) · `anon_questions` (M5) · `employer_submissions` (M6) · `wa_bot_enabled` (M8). All flips audited + bust the `flags` tag.

**Cron jobs** (all `CRON_SECRET`-guarded, idempotent, run-logged): `purge-deleted-accounts` (day-14) · unverified-account cleanup (7-day) · `jobs-expire` · `link-check` (weekly) · `purge-verification-docs` (90-day) · `purge-wa-logs` (90-day) · blog publish-at scheduler · audit yearly R2 export · media draft-usage scan · resume-photo orphan-sweep (weekly) · `backup-verify-ping`.

**Storage buckets:** `content-media` (public) · `avatars` (public) · `covers` (public) · `verification-docs` (**private**, 90-day purge) · `resume-photos` (**private**, owner-scoped).

**Transactional email set:** M2's eight (verify, reset, email-change ×2, method added/removed, deletion requested/canceled, force-rename) + M5 decision notices (writer, verification, sanction) + M6 employer verification (flag-gated). Zero marketing ever.

## 13. Risk register (plan-level)

| #     | Risk                                       | Plan response                                                                                                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1    | Content bottleneck                         | **Largely mitigated: most launch content pre-written (Q2/v1.7)** — residual risk is porting + review throughput. CMS-first build order in Phase 1; style guide as the porting template; author + reviewer recruited in Phase 0; acceptance gates on content, not just code; add authors if the review queue's >7-day amber chip becomes the norm |
| R2    | Single-VPS / bus factor                    | Phase 0 backup+restore drill before any real data; monthly drills; documented runbook                                                                                                                                                                                                                                                            |
| R6    | Plate/anchor complexity                    | `@epharmatica/editor` wrapper first; anchor fixture suite per block kind; `highlight_kinds` flag as production fallback; renderer snapshot tests                                                                                                                                                                                                 |
| R3    | BYOK friction                              | Wizard with screenshots; Groq/Gemini first; product fully valuable without AI                                                                                                                                                                                                                                                                    |
| R7    | Meta/YouTube dependency shifts             | Phase 4 entry gate re-verifies pricing; video URLs stored abstractly                                                                                                                                                                                                                                                                             |
| R-M2b | Purge drift as tables accumulate           | `personal_data_registry` + CI failure on unregistered `user_id` tables — wire in Phase 0                                                                                                                                                                                                                                                         |
| R-M4d | Admin shell forked by later modules        | M4 §10 contracts are review-gated; deviations require a PRD update                                                                                                                                                                                                                                                                               |
| Legal | Policies promise features that don't exist | Launch checklist in `securities.md` §16 ties every policy promise to a shipped feature                                                                                                                                                                                                                                                           |

## 14. Open decisions that move the timeline

1. **Q2 — content team shape — RESOLVED (v1.7):** founder is primary author with most launch content already written; team = founder + 1 recruited author + ≥1 external licensed reviewer (required before first publish — self-approval is workflow-blocked). Phase-1 content work is porting + review, not greenfield authoring.
2. **Legal counsel pass — RESOLVED (19 Jul 2026, founder confirmation).** Remaining mechanical step: fill the bracketed fields still in the draft files (entity name, address, jurisdiction city, liability cap, effective dates, backup/email provider picks) and remove DRAFT headers before the pages go live.
3. **YouTube channel creation** + release cadence: content-track gate for Phase 1 launch.
4. **Employer-form activation criteria** (M6) and **outbound-WhatsApp activation criteria** (M8): founder calls, both gated behind flags/PRD amendments — do not block builds. Interim employer intake decided (v1.7): `jobs@epharmatica.com` surfaced on the Jobs page; Content Policy wording points at "the employer submission channel on the Jobs page" so the copy stays true before and after the flag flips.
5. **Urdu locale timing** (A2): next-intl + RTL conventions from day one keep this additive.
