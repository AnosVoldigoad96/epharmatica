# ePharmatica — Product Requirements Document (PRD)

|                     |                                                          |
| ------------------- | -------------------------------------------------------- |
| **Product**         | ePharmatica — Learning & Community Platform for Pharmacy |
| **Version**         | 1.7 (Foundation)                                         |
| **Status**          | Approved for build — Phase 0/1                           |
| **Date**            | 19 July 2026                                             |
| **Owner**           | Founder / Product Lead                                   |
| **Decision method** | Structured MCQ elicitation rounds (see §5 Decision Log)  |

> **Changelog — v1.7 (19 Jul 2026):** **Build-phase sync (founder decisions).** (1) **Monorepo:** repo re-scoped to pnpm + Turborepo — `apps/web` plus `@epharmatica/tokens` / `ui` / `editor` / `database` / `config` workspace packages; deployment topology unchanged (one Next.js container); ARCHITECTURE.md §3.2 codemap to be amended to v1.2 in the Phase-0 scaffolding PR. (2) **CMS stays in-app** at `/admin` per §7.10 (re-confirmed over a separate admin app); an optional Cloudflare Access / IP-allowlist layer on `/admin/*` is added as a fourth defense layer. (3) §7.1 waitlist **role labels superseded by locked STYLE S12**: Student / Professional / Other. (4) Formal record of the M6-2 amendment to D14: jobs launch curated-via-CMS only; employer form + aggregation ship dormant behind `employer_submissions`; interim employer intake = `jobs@epharmatica.com` on the Jobs surface, Content Policy wording updated to "employer submission channel on the Jobs page". (5) **Q2 resolved:** founder is the primary author with most launch content already written (pre-CMS material to be ported and reviewed); one additional author and one independent licensed reviewer will be recruited, satisfying the author≠approver workflow rule and G6; further authors added when volume demands (R1 path). (6) **Q4 updated:** legal counsel review **complete** (19 Jul 2026); bracketed operational fields to be filled and DRAFT headers removed at launch. Companion build docs: `development-plan.md`, `rules.md`, `securities.md`.
>
> **Changelog — v1.6 (18 Jul 2026):** **Module PRD series complete** — eight module PRDs (M1 Learning · M2 Accounts · M3 AI Suite · M4 CMS/Admin · M5 Community · M6 Jobs · M7 Resume · M8 WhatsApp) elicited via 47 MCQ answers → 51 recorded module decisions. **Governance:** module PRDs are authoritative for module-level detail; on conflict with §7, the module PRD + this changelog govern. **Notable amendments to §7:** reader is one-page-per-subtopic with topic overviews (M1-1, supersedes the hide-redundant-level note); subtopic `short/long_video_url` fields replaced by derived `primary_video_url` from author-placed embed blocks (M1-2); jobs launch **curated-via-CMS only** with the employer form + aggregation dormant behind a flag (M6-2, amends D14 sequencing); WhatsApp bot is bilingual English/Roman-Urdu on a dedicated number (M8-1/2). Full decision logs live in each `prd-m*.md`.
>
> **Changelog — v1.5 (18 Jul 2026):** Founder style series (12 MCQ decisions, S1–S12) locked into `STYLE.md` v1.3 — radius finalized **0px** (immutable), 20px mobile gutters / **1200px** container, **split landing hero** over live system primitives, system-default theme, always-underlined content links, A−/A+ reader sizing, 2px reading-progress bar, title-anchored progress strip, **instant navigation** (no page transitions), Phase-0 tooling adopted (`/dev/system` page, Storybook, Style Dictionary → Figma tokens, RTL conventions), **waitlist expanded to email + module + role** (§7.1, §9, Phase 0).
>
> **Changelog — v1.4 (18 Jul 2026):** Design system extended to **v1.2** — added the full **Mobile & Touch** spec (mobile-first, 44px touch targets, bottom tab bar, mobile reader, bottom sheets, safe-areas/PWA polish) and round-2 system additions (data-viz, community thread anatomy, stat panels, toast taxonomy, OG-image template, error pages, and a no-streaks gamification policy). Reinforces A1 (PWA-ready) as a styling requirement.
>
> **Changelog — v1.6 (18 Jul 2026):** **Module PRD series complete** — eight module PRDs (M1 Learning · M2 Accounts · M3 AI Suite · M4 CMS/Admin · M5 Community · M6 Jobs · M7 Resume · M8 WhatsApp) elicited via 47 MCQ answers → 51 recorded module decisions. **Governance:** module PRDs are authoritative for module-level detail; on conflict with §7, the module PRD + this changelog govern. **Notable amendments to §7:** reader is one-page-per-subtopic with topic overviews (M1-1, supersedes the hide-redundant-level note); subtopic `short/long_video_url` fields replaced by derived `primary_video_url` from author-placed embed blocks (M1-2); jobs launch **curated-via-CMS only** with the employer form + aggregation dormant behind a flag (M6-2, amends D14 sequencing); WhatsApp bot is bilingual English/Roman-Urdu on a dedicated number (M8-1/2). Full decision logs live in each `prd-m*.md`.
>
> **Changelog — v1.5 (18 Jul 2026):** Founder style series (12 MCQ decisions, S1–S12) locked into `STYLE.md` v1.3 — radius finalized **0px** (immutable), 20px mobile gutters / **1200px** container, **split landing hero** over live system primitives, system-default theme, always-underlined content links, A−/A+ reader sizing, 2px reading-progress bar, title-anchored progress strip, **instant navigation** (no page transitions), Phase-0 tooling adopted (`/dev/system` page, Storybook, Style Dictionary → Figma tokens, RTL conventions), **waitlist expanded to email + module + role** (§7.1, §9, Phase 0).
>
> **Changelog — v1.4 (18 Jul 2026):** `STYLE.md` advanced to **v1.2** — corner radius reverted to the original **0px** boxy contract (5px experiment retired); **mobile & touch system added** (container-query grids, fluid type, 44px coarse-pointer targets, reader bottom action bar, stacked monograph-row tables, touch selection sheet, safe-area/PWA metadata); new component specs (selection popover, toasts, offline banner, data-viz rules, keyboard map); all specimen/example copy genericized.
>
> **Changelog — v1.3 (18 Jul 2026):** Design system finalized (see `STYLE.md` v1.1 + `style-specimen.html`) — Assumption **A7 resolved**: palette **Pharmacopoeia** (deep teal `#0E6B63` on archival paper), **5px** corner radius (softened-boxy), type **Archivo / Instrument Sans / IBM Plex Mono** (supersedes the PDF's interim Poppins), signature **monograph labels**, plus ten system upgrades (blister grids, completion stamp, highlighter palette, figure system, squared icons, print styles, brand mark, voice guide, learning-state glyphs, density modes).
>
> **Changelog — v1.2 (18 Jul 2026):** Framework pin corrected from "Next.js 15+" to **Next.js 16 (latest 16.2.x stable)** — Turbopack default bundler, opt-in Cache Components, React 19.2; Node 22 LTS unchanged (16 requires Node 20+). ARCHITECTURE.md updated accordingly (`middleware.ts` → `proxy.ts`; no custom webpack config).
>
> **Changelog — v1.1 (18 Jul 2026):** Resolved open questions Q1, Q3, Q4, Q5 (§16): domain **epharmatica.com**; YouTube channel to be created (content-track task); hosting region fixed to **Hetzner EU** (D16, §10); companion legal drafts produced (Terms, Privacy, Content Policy, Medical Disclaimer — counsel review pending); semester mapping owned by content Authors (§7.2.1). YouTube embeds specified as privacy-enhanced mode (§7.2.4).

---

## 1. Executive Summary

ePharmatica is a web platform with two connected halves:

1. **A learning platform** delivering learning-optimized, structured, and visual study material covering the HEC-approved Pharm-D syllabus — written notes authored in a block-based editor, paired with short-form (and optionally long-form) videos embedded from the ePharmatica YouTube channel. Learners create free accounts to track progress, highlight, bookmark, write personal notes, and use AI study tools powered by their own API keys (BYOK).
2. **A professional community platform** for pharmacists of Pakistan (open to the world): a hybrid discussion forum, an editorial blog written by approved writers, a curated pharmaceutical jobs portal, and an ATS-friendly resume builder.

Everything is managed through a role-based in-app CMS. The product ships in phases, beginning with the learning system; the public landing page presents the full vision with unreleased modules marked **Coming Soon**.

**Strategic posture:** content-first, cost-disciplined (single self-hosted VPS, free-tier services, BYOK AI so the platform never pays for inference), globally usable (curriculum organized by subject, not by Pakistani semester), and monetization-flexible (no paywall at launch; an entitlement layer is built in so any business model can be switched on later without refactoring).

---

## 2. Vision, Goals & Non-Goals

### 2.1 Vision

Become the default study companion for Pharm-D students in Pakistan and a credible professional home for its pharmacists — the place where a student learns pharmacology in first year and, five years later, finds their first industry job.

### 2.2 Product Goals

- **G1 — Learning quality:** Every published topic must be genuinely easier to learn from than the textbook chapter it maps to (structured, visual, exam-aware, video-paired).
- **G2 — Habit formation:** Students return because their progress, highlights, and notes live here.
- **G3 — Zero-marginal-cost AI:** AI study features at full quality with no inference cost to the platform (BYOK).
- **G4 — Community gravity:** Forum + blog + jobs make ePharmatica valuable after graduation, not just before exams.
- **G5 — Operational frugality:** Total infrastructure cost under ~US$15/month at launch.
- **G6 — Editorial integrity:** All study and blog content passes a review workflow before publication; medical-education accuracy is a hard requirement.

### 2.3 Non-Goals (explicitly out of scope for v1.x)

- Native mobile apps (the web app is fully responsive; PWA-ready architecture only).
- Live classes, webinars, or cohort courses.
- Hosting video files (all video is embedded from YouTube).
- University-specific LMS features (assignments, attendance, grading).
- Payments/subscriptions at launch (architecture supports them later — see §7 and §16).
- Direct in-platform job applications with employer dashboards (v1 links out to apply; employer self-serve is limited to a submission form).
- Automated pharmacist license verification against regulator databases (v1 verification is manual review).

---

## 3. Target Users & Personas

**P1 — Ayesha, 2nd-year Pharm-D student (Lahore).** Primary persona. Studies from slides + WhatsApp'd PDFs; loses her notes every semester. Needs clear explanations mapped to her syllabus, videos for hard topics, and a way to track what she's covered. Price-sensitive; has a smartphone-first, sometimes low-bandwidth connection.

**P2 — Daniyal, final-year student preparing for exams & first job.** Uses study material selectively, cares about the jobs portal and the resume builder. Will apply for the Verified Pharmacist badge after licensure.

**P3 — Sana, hospital pharmacist (7 yrs experience).** Community-side persona. Reads and writes blogs (approved writer), answers Question threads, has a Verified Pharmacist badge, browses senior roles occasionally.

**P4 — International pharmacy student.** Discovers topics via search engines. Doesn't care about Pakistani semesters — validated by the decision to organize content by subject with semester as a subtle tag.

**P5 — Employer / HR at a pharma company.** Submits job listings via a public form; interacts with the Jobs Manager, not the CMS.

**P6 — Internal content team.** Authors, reviewers, blog editors, jobs manager, moderators, admins working inside the CMS (see §12 roles).

---

## 4. Product Principles

1. **Content is the product.** Engineering exists to make excellent content easy to author, review, publish, find, and study.
2. **Free to read the preview, sign in for depth.** Public previews power SEO and discovery; the account unlocks full content and all study tools.
3. **Global by default, Pakistani by design.** Subject-first taxonomy, English UI, with HEC semester numbers as metadata and Pakistan-specific community/jobs value.
4. **Own the stack.** Self-hosted backend, MIT-licensed editor, components copied into the repo (shadcn model). No licensing landmines, no vendor lock-in.
5. **The user pays for their own AI.** BYOK keeps costs at zero, keeps the platform provider-neutral, and lets power users choose their model.
6. **Every feature ships with its admin surface.** Nothing goes to production without the CMS controls to manage it.
7. **Design for the phase you're in.** A 300-user community gets threads and categories, not vote-ranked feeds; automation replaces manual process only when volume demands it.

---

## 5. Decision Log (from MCQ elicitation rounds)

| #   | Decision                       | Choice                                                                                                                                       | Notes / Rationale                                                                                                                                                                                                                                                             |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Backend platform               | **Supabase, self-hosted**                                                                                                                    | Delegated to PRD; full justification in §11.2.                                                                                                                                                                                                                                |
| D2  | Rich-text editor               | **Plate**                                                                                                                                    | MIT license end-to-end (incl. AI), shadcn-native component distribution, 50+ plugins, comments/suggestions for editorial review. Runner-up: BlockNote (XL/AI packages are GPL-3.0 or paid). Yoopta rejected on maintainer bus-factor; Novel rejected as too thin/slow-moving. |
| D3  | Business model                 | **Deferred — design for flexibility**                                                                                                        | No paywall at launch. Entitlement + feature-flag layer built from day one (§7.11, §16).                                                                                                                                                                                       |
| D4  | Content hierarchy              | **Subject → Chapter → Topic → Subtopic**, HEC semester as a subtle tag                                                                       | Keeps content usable worldwide; Pakistani students filter by semester when they want to.                                                                                                                                                                                      |
| D5  | Progress tracking              | **Manual "Mark as complete" only**                                                                                                           | At subtopic level; rolls up to topic/chapter/subject percentages.                                                                                                                                                                                                             |
| D6  | Self-assessment (MCQ practice) | **Later phase**                                                                                                                              | Scheduled Phase 5 (§6); can be pulled forward — flagged assumption A3.                                                                                                                                                                                                        |
| D7  | Auth methods                   | **Email + password, and Google OAuth**                                                                                                       | Via Supabase Auth (GoTrue). HTTPS termination prerequisite noted in §13.                                                                                                                                                                                                      |
| D8  | Content access                 | **Public previews; login for full content + all features**                                                                                   | Preview = first section(s) of each topic, fully indexable.                                                                                                                                                                                                                    |
| D9  | BYOK providers                 | **OpenAI, Anthropic, Google Gemini, OpenRouter, Groq**                                                                                       | Unified through a provider-adapter layer (§7.5).                                                                                                                                                                                                                              |
| D10 | AI feature scope               | **Explain selection + Summarize topic + Chat-with-topic Q&A**                                                                                | Grounded strictly in ePharmatica content; ships in Phase 1.                                                                                                                                                                                                                   |
| D11 | Pharmacist verification        | **Optional "Verified Pharmacist" badge, manual review**                                                                                      | Submission of credentials → admin review queue (§7.6.4).                                                                                                                                                                                                                      |
| D12 | Forum model                    | **Hybrid**                                                                                                                                   | Categories + threads backbone; two thread types (Discussion / Question); reply upvotes; accepted answers on Questions. Discourse-style; works at low volume.                                                                                                                  |
| D13 | Blog publishing                | **Approved writers only**                                                                                                                    | Writer application flow; editorial review before publish.                                                                                                                                                                                                                     |
| D14 | Jobs sourcing                  | **Admin-curated + employer submissions (reviewed) + external aggregation later**, run by a dedicated **Jobs Manager** CMS role               | Aggregation is Phase 3.5+, manual-first.                                                                                                                                                                                                                                      |
| D15 | WhatsApp system                | **User-initiated content bot first** (free service-conversation window); paid outbound (alerts/marketing templates) only after funding/scale | Bot answers: topic lookup, latest blogs, new jobs — replying with content summaries + links. Pricing re-verification note in §7.9.                                                                                                                                            |
| D16 | Deployment                     | **Option A — self-host everything on one VPS, Hetzner EU**                                                                                   | 4 vCPU / 8 GB RAM / 80–160 GB NVMe (CX33-class, Falkenstein/Nuremberg); Coolify + Docker; Cloudflare in front; offsite backups. Full runbook §10.                                                                                                                             |
| D17 | Phase 1 scope                  | **Learning system + accounts + AI (BYOK) + landing page**                                                                                    |                                                                                                                                                                                                                                                                               |
| D18 | Post-Phase-1 order             | **Community → Jobs + Resume → WhatsApp bot**                                                                                                 | User ranked AI first, but AI was absorbed into Phase 1 (D17), so remaining ranking defines Phases 2–4.                                                                                                                                                                        |

---

## 6. Phased Roadmap

Each phase has a hard gate: **acceptance criteria must pass before the next phase starts.** Timeboxes are planning estimates for a 1–2 developer team, not commitments.

### Phase 0 — Foundation (2–3 weeks)

Infra + skeleton. VPS provisioned with Coolify; self-hosted Supabase running with HTTPS; Cloudflare DNS/CDN; CI/CD green (lint, typecheck, test, build, deploy); Next.js app scaffolded with Tailwind v4 + shadcn/ui, design tokens, light/dark themes; Supabase migrations + type codegen wired; Sentry, Umami analytics, Uptime Kuma, nightly backups operational; **landing page live** with brand, feature overview, Coming Soon modules, and segmented waitlist capture (email + module + role); system tooling online — `/dev/system` primitives page, Storybook initialized, Style Dictionary token pipeline (single source for the CSS `@theme` and Figma tokens), RTL-safe conventions from the first component.
**Acceptance:** deploy-on-merge works; backup restore drill passes on a scratch database; landing scores ≥90 Lighthouse performance/SEO/accessibility on mobile.

### Phase 1 — Learning Platform MVP (6–10 weeks)

Content model + CMS authoring (Plate) + review workflow; public learn pages with previews; accounts (email + Google); reader features: highlights, bookmarks, personal notes, mark-as-complete progress + dashboard; embedded short/long YouTube videos; site search (Postgres FTS); AI study suite (BYOK: explain / summarize / chat-with-topic); settings incl. AI key management.
**Acceptance:** ≥2 subjects with ≥25 published subtopics end-to-end through the review workflow; a signed-in user can highlight, note, bookmark, complete, and use all three AI features with at least 2 providers; preview gating verified logged-out; RLS test suite passes.

### Phase 2 — Community (4–6 weeks)

Hybrid forum (categories, Discussion/Question threads, reply upvotes, accepted answers, reporting, moderation queue); blog module (approved writers, Plate editor, editorial workflow, public blog); Verified Pharmacist application + badge; user public profiles.
**Acceptance:** full moderation loop demonstrable (report → queue → action → audit log); a writer application → approval → draft → review → publish loop completes; badges render across forum/blog/profile.

### Phase 3 — Jobs Portal + Resume Builder (4–6 weeks)

Jobs listings (curated + employer submission form with review), filters/search, expiry automation, Jobs Manager CMS surface; resume builder: guided profile-driven data entry, ATS-safe default template + 2–3 styled templates, live preview, client-side PDF export, multiple saved resumes.
**Acceptance:** an employer submission reaches publication only via Jobs Manager approval; expired jobs auto-hide; exported PDF passes a text-extraction check (selectable text, correct reading order) on the ATS template.

### Phase 4 — WhatsApp Content Bot (3–4 weeks)

Meta WhatsApp Business Cloud API webhook; menu-driven intents (Topics / Blogs / Jobs); topic search → summary + link (+ video link); latest blogs list; newest jobs list; session/message logging; admin visibility.
**Acceptance:** end-to-end user-initiated conversation on a production number; zero business-initiated sends; logs visible in CMS.

### Phase 5 — Assessment Engine (deferred, scope TBD)

Practice MCQs per topic, attempt history, weak-area surfacing. Re-scope at Phase 3 planning (Assumption A3 — may be pulled earlier if learning-retention metrics demand it).

### Continuous tracks (all phases)

Content production pipeline **and YouTube channel creation + publishing cadence** (the true critical path — see Risk R1; the channel does not yet exist and must be live with initial videos before Phase 1 launch), SEO, accessibility, performance budgets, security patching, and monthly restore drills.

---

## 7. Feature Specifications

### 7.1 Landing Page (Phase 0)

- Hero (S4, v1.5): **split composition** — statement block (value proposition, brand mark, primary CTA "Start learning free" + ghost "Join waitlist") beside a live demo of real system primitives; stacks statement-first on mobile.
- Feature sections for all six modules (Learning, AI Study Tools, Community, Blog, Jobs, Resume Builder); unreleased ones carry a **Coming Soon** ribbon and a waitlist form — **email + module of interest + role (student / pharmacist / other)** — stored in `waitlist_signups` (S12, v1.5).
- Social proof placeholder, YouTube channel strip, FAQ, footer (About, Contact, Privacy, Terms, Content Policy).
- Fully static/ISR; Lighthouse ≥90 on mobile.

### 7.2 Learning Platform (Phase 1)

**7.2.1 Content model.** `Subject → Chapter → Topic → Subtopic`. The **subtopic is the atomic learning unit**: it owns the Plate JSON document, optional short-form video URL, optional long-form video URL, estimated reading minutes, and ordering. Topics aggregate subtopics; a topic with no natural subdivision gets a single default subtopic (UI hides the redundant level). Semester tagging: nullable `semester` (1–10) on topic (inheritable from subject default), displayed as a small tag/filter — never as primary navigation (D4). The HEC semester mapping is set and maintained by the content **Author** at authoring time (against the current HEC syllabus edition) and spot-checked during review (Q5 resolution, v1.1).

**7.2.2 Authoring (CMS).** Plate editor configured with: headings, rich marks, lists, tables, callouts (Definition / Clinical Pearl / Mnemonic / Exam Alert / Warning), images (Supabase Storage, auto-compressed), YouTube embed block, code block (rarely needed but free), table of contents block, and custom **Drug Card** block (name, class, MOA, uses, adverse effects, contraindications — structured fields rendered as a styled card). Slash menu + drag handles on. Comments/suggestions enabled for the review workflow.

**7.2.3 Editorial workflow.** `draft → in_review → changes_requested → approved → published` (+ `archived`). Authors write; Reviewers comment/suggest and approve; Publishers (Content Managers) publish. Every publish snapshots a revision (`content_revisions`) with diff-viewable history and one-click rollback. Audit log on all transitions.

**7.2.4 Reader experience.** Server-rendered topic pages: sticky sub-navigation of subtopics, right-rail table of contents (from headings), reading-time, semester tag, prev/next navigation, breadcrumbs. Videos render as **lite YouTube facades** (thumbnail + play button; the iframe loads on click via YouTube's privacy-enhanced mode, `youtube-nocookie.com`) to protect performance and limit third-party cookies. Typography tuned for study: max ~70ch line length, generous spacing, print stylesheet.

**7.2.5 Access gating (D8).** Logged-out users see the first N blocks (per-subtopic `preview_block_count`, default ≈ first section) followed by a fade-out and sign-in CTA. Full JSON for gated content is **never sent to the client** for anonymous sessions (server-side truncation, not CSS hiding). All interactive study tools require login.

**7.2.6 Study tools (signed-in).**

- **Highlights:** text-selection highlighting in 4 colors; stored as `{subtopic_id, block_id, anchor_offsets, text_snapshot, color}`; re-anchoring on content edits falls back to snapshot text search; orphaned highlights surface in "My Highlights" rather than silently vanishing.
- **Bookmarks:** any subtopic/topic; organized list in dashboard.
- **Personal notes:** a lightweight Plate instance attached per subtopic (private, RLS-enforced), plus notes attachable to a specific highlight.
- **Progress (D5):** explicit "Mark as complete" button per subtopic; completion timestamps; roll-up percentages per topic/chapter/subject; a subtle "Continue where you left off" card on the dashboard. No automatic tracking.
- **Dashboard:** continue-studying, progress by subject, recent highlights/notes, bookmarks.

**7.2.7 Search.** Postgres full-text search (`tsvector` over title + extracted plain text of published content), weighted (title > headings > body), with subject/semester filters. Upgrade path: Meilisearch/Typesense container when FTS relevance becomes limiting (not before).

### 7.3 Accounts & Profiles (Phase 1)

- Supabase Auth: email+password (with verification email) and Google OAuth (D7). Password reset, session management, account deletion (GDPR-style erasure incl. content anonymization rules).
- Profile: username (unique, URL-safe), display name, avatar, user type (`student | pharmacist | other`), institution (optional), country, bio. Public profile pages activate in Phase 2.
- Settings: profile, appearance (light/dark/system), AI keys (§7.5.4), data export (JSON of notes/highlights), delete account.

### 7.4 (Reserved) — merged into 7.2.6.

### 7.5 AI Study Suite — BYOK (Phase 1)

**7.5.1 Providers (D9).** OpenAI, Anthropic, Google Gemini, OpenRouter, Groq — implemented via the Vercel AI SDK's provider abstraction behind a single internal `AiProvider` interface (streamText, model listing, error normalization). Users select provider + model; sensible defaults per provider. Provider docs are linked in-app (e.g., Anthropic's official API docs at https://docs.claude.com/en/api/overview) with short "how to get a key" guides — Groq and Gemini are surfaced first for students since they offer generous free tiers (verify current terms at build time).

**7.5.2 Features (D10).**

- **Explain:** select any text in a subtopic → "Explain with AI" → popover with explanation grounded in the surrounding section; follow-up "simpler / example / mnemonic" quick actions.
- **Summarize:** one-click structured summary of the current subtopic (key points, must-know terms, common exam angles).
- **Chat with topic:** side-panel chat whose context is the current topic's full content (serialized to Markdown). Strict grounding: the system prompt instructs answering from provided content, saying so when the answer isn't in it. Single-topic context fits comfortably in modern context windows; cross-topic RAG with `pgvector` is a future enhancement, not v1.
- Every AI surface carries a persistent disclaimer: educational aid, may contain errors, not medical advice — verify against authoritative sources.

**7.5.3 Architecture.** All calls go through a Next.js route handler that streams responses (SSE). The server injects the user's key per-request, never logs prompts/keys, and enforces per-user rate limits (e.g., 30 requests/5 min) to protect users from key-burning bugs. No conversation storage in v1 (session-only), keeping privacy posture simple; optional saved chats are a later enhancement.

**7.5.4 Key management & security.** Two storage modes, user-selectable:

- **This device only (default):** key kept in the browser (IndexedDB), sent per-request over TLS to the proxy route, held in memory only.
- **Sync across devices:** key encrypted server-side (libsodium sealed-box / AES-256-GCM) with an app-level encryption key held only in server env (never in the database); decrypted transiently per request.
  Keys are write-only in the UI (masked after save), validated with a 1-token test call on save, revocable instantly, and excluded from logs/Sentry scrubbing rules. The data-deletion flow purges keys first.

### 7.6 Community Platform (Phase 2)

**7.6.1 Forum — hybrid model (D12).**

- **Structure:** fixed admin-managed categories (initial set: Study Help, Clinical Practice, Industry & Regulatory Affairs, Careers & Licensing, General Lounge, Platform Feedback), each holding threads.
- **Thread types:** `discussion` (open-ended) and `question`. Question threads display an answer count and allow the thread author (or a moderator) to mark one reply as the **Accepted Answer**, which pins to the top with a distinct style.
- **Votes:** upvotes on replies only (no downvotes — protects beginners; D12 rationale). Default reply sort: accepted answer → most upvoted → chronological; user-switchable to pure chronological.
- **Composer:** a trimmed Plate configuration (rich text, lists, images, links, code) — same editor family as everywhere else.
- **Signals & hygiene:** thread tags (free-form, admin-mergeable), pinned + locked threads, subscribed-thread in-app notifications, @mentions, edit windows with edit history, soft-delete.
- **Moderation:** report on any thread/reply (reason + note) → moderation queue in CMS → actions: dismiss, hide, delete, warn user, temp-mute (1/7/30 days), ban. All actions audit-logged. New-account friction: accounts < 24 h old are rate-limited (e.g., 2 threads + 10 replies/day) as basic spam control.
- **Verified Pharmacist badge (D11):** rendered beside the username in forum, blog, and profiles.

**7.6.2 Blog (D13).**

- Public blog with categories/tags, author pages, related posts, and full SEO treatment (OG images, structured data).
- **Approved writers only:** users apply via a form (motivation, sample, credentials) → application queue → approval grants the `blog_writer` role.
- Workflow mirrors study content: `draft → in_review → published` with Blog Editor review, revisions, scheduling (publish-at datetime), and cover images.
- Comments on posts are **off in v1** (community discussion belongs in the forum; a "Discuss in forum" button auto-creates/links a thread).

**7.6.3 Public profiles (Phase 2).** `/u/[username]`: avatar, bio, badges, user type, joined date, recent forum activity, published blog posts. Study data (progress/notes/highlights) is never public.

**7.6.4 Verified Pharmacist application.** Form: full name, registration/license number, issuing council, graduation year, document upload (license/degree scan → private Storage bucket). Admin review queue with approve/reject + reason. Approved: badge + `verified_at`. Documents auto-purge 90 days after decision (privacy). No automated registry checks in v1 (Non-Goal).

### 7.7 Jobs Portal (Phase 3)

- **Listing schema:** title, organization, logo (optional), location (city + country + on-site/hybrid/remote), employment type (full-time/part-time/contract/internship/house job), category (hospital, community/retail, industry — production/QA/QC/RA/PV, sales & marketing, academia, regulatory bodies, other), experience level, salary range (optional, PKR-friendly), description (Plate), how-to-apply (external URL **or** email), source (`curated | employer_submission | aggregated`), posted/expiry dates, status (`pending | published | expired | rejected | archived`).
- **Sources (D14):** (a) Jobs Manager creates curated listings in CMS; (b) public employer submission form (with contact email verification) lands in a review queue; (c) later: aggregation from external boards/newspapers — manual-first via a quick-add CMS tool, automation deferred.
- **Public UX:** filterable index (category, city, type, experience, freshness), job detail pages with clear "Apply" out-links, share buttons (WhatsApp-first), and structured data (`JobPosting` schema.org) for Google Jobs indexing.
- **Lifecycle automation:** listings auto-expire (default 30 days, editable); expired listings 410/redirect to index with "expired" notice.
- **Saved jobs** for signed-in users; **job alerts are out of v1** (arrive with WhatsApp/notifications phase).

### 7.8 Resume Builder (Phase 3)

- **Data-driven:** users fill structured sections — personal/contact, professional summary, education, experience (incl. house job/internships), licenses & certifications, skills, publications/projects, references — stored as versioned JSON (`resumes` table, multiple resumes per user, duplicate-and-edit).
- **Templates:** `ATS Standard` (default: single column, semantic headings, standard fonts, zero graphics) + 2–3 styled templates (accent color, two-column). Template switch never touches data.
- **Export:** client-side PDF via `@react-pdf/renderer` — guarantees a true text layer (selectable, correct reading order) for ATS parsing; A4 default with US-Letter toggle.
- **Assists:** live preview, completeness meter, per-section writing tips (pharmacy-specific), optional AI polish of summary/bullets **using the user's BYOK key** (reuses §7.5 infrastructure; clearly labeled).
- **Privacy:** resumes are private; no public resume pages in v1; PDF generation happens in-browser (data never renders server-side).

### 7.9 WhatsApp Content Bot (Phase 4) — user-initiated (D15)

- **Model:** inbound-only assistant on the Meta WhatsApp Business Cloud API. Users message first; the bot replies within the customer-service window. Business-initiated template messaging (job alerts, content notifications, marketing) is explicitly **out of scope until funded** — the system stores opt-ins from day one so the upgrade is a switch-flip. _Note: Meta's WhatsApp pricing model has changed before (conversation-based → per-message); re-verify current free-tier mechanics for user-initiated service conversations at build time._
- **Interaction design:** greeting → interactive list menu: **1) Find a topic 2) Latest blogs 3) New jobs 4) About ePharmatica.** Topic flow: user sends keywords → Postgres FTS lookup → top 3 matches as buttons → selected topic returns a short summary, the study link, and the short-form video link. Blogs/jobs flows return the latest 3–5 items with links. Unrecognized input → gentle fallback to menu. **No LLM in v1** (menus + FTS keep cost zero and behavior predictable); optional AI-assisted parsing later.
- **Architecture:** `/api/whatsapp/webhook` (signature-verified) → intent router → reply via Graph API. `wa_contacts` (phone hash, opt-in flags) + `wa_messages` log (retention 90 days). CMS surface: conversation log viewer, canned-response editor, kill-switch.
- **Compliance:** respond only to inbound; honor STOP; publish a WhatsApp privacy note; phone numbers stored hashed except where reply routing requires the raw number (encrypted at rest).

### 7.10 CMS / Admin (built progressively, every phase)

A protected `/admin` area inside the same Next.js app (no separate deployment). Modules: Dashboard (content/publishing stats, queues), Content (subjects/chapters/topics/subtopics tree, Plate editor, workflow queues, revisions), Media library, Taxonomy (semesters, tags, forum categories, job categories), Blog (posts, writer applications), Community (moderation queue, reports, user sanctions), Jobs (listings, submissions queue, expiry overrides), Verifications (pharmacist badge queue), Users (search, roles, sanctions), WhatsApp (logs, canned responses), Settings (feature flags, Coming-Soon toggles, entitlements, site metadata), Audit log (filterable, exportable). Role-gated per §12; every mutating admin action writes to `audit_log`.

### 7.11 Monetization-Flexibility Layer (D3 — built in Phase 1, dormant)

- `plans` and `entitlements` tables + a single server-side `can(user, feature)` gate used by any feature that could ever be premium (AI surfaces, resume templates, future content tiers). At launch every user maps to an implicit `free` plan where everything current is allowed.
- Feature flags (DB-backed, cached) control module visibility incl. Coming Soon states — marketing toggles without deploys.
- Future payment note (not v1): Stripe is unavailable to Pakistan-based merchants; when monetization activates, evaluate merchant-of-record providers (Paddle, Lemon Squeezy) and local rails (JazzCash/Easypaisa via aggregators). Recorded here so architecture (server-checked entitlements, no client trust) stays gateway-agnostic.

---

## 8. Information Architecture & Routes

```
/                                   Landing (features + Coming Soon + waitlist)
/learn                              Subject index
/learn/[subject]                    Chapters + progress
/learn/[subject]/[chapter]          Topic list
/learn/[subject]/[chapter]/[topic]  Reader (subtopics, videos, tools, AI panel)
/search                             Global search
/dashboard                          My learning (progress, continue, highlights, notes, bookmarks, saved jobs)
/blog · /blog/[slug] · /blog/author/[username]
/community · /community/[category] · /community/t/[thread-slug] · /community/new
/jobs · /jobs/[slug] · /jobs/submit (employer form)
/resume                             Builder (editor, templates, export)
/u/[username]                       Public profile (Phase 2)
/auth/sign-in · /auth/sign-up · /auth/reset · /auth/callback
/settings/{profile,appearance,ai-keys,data}
/verify-pharmacist                  Badge application
/admin/**                           CMS (role-gated)
/about · /contact · /privacy · /terms · /content-policy
/api/ai/* · /api/whatsapp/webhook · /api/og/* (OG image gen)
```

Slugs are stable, lowercase, hyphenated; renames create redirects (`slug_history`).

## 9. Data Model (entity overview)

All tables `snake_case`, UUID PKs, `created_at/updated_at`, **RLS enabled on every table** (§13.2). Plate documents stored as `jsonb`.

**Identity & access:** `profiles` (1:1 auth.users; username, display_name, avatar_url, user_type, country, institution, bio, role, is_verified_pharmacist, verified_at) · `pharmacist_verifications` (user_id, license_no, council, document_path, status, reviewer_id, decided_at) · `plans`, `entitlements`, `feature_flags` · `waitlist_signups` · `audit_log` (actor_id, action, entity, entity_id, meta jsonb).

**Learning content:** `subjects` (name, slug, description, icon, default_semester, order) · `chapters` (subject_id, name, slug, order) · `topics` (chapter_id, name, slug, semester, order, status) · `subtopics` (topic_id, title, slug, order, content jsonb, plain_text tsvector-source, preview_block_count, short_video_url, long_video_url, reading_minutes, status, published_at) · `content_revisions` (subtopic_id, content jsonb, editor_id, note) · `content_review_events` (subtopic_id, from_status, to_status, actor_id, comment).

**Study data (all rows owned by user_id):** `highlights` (subtopic_id, block_id, anchor jsonb, text_snapshot, color, orphaned bool) · `bookmarks` (target_type, target_id) · `user_notes` (subtopic_id, highlight_id nullable, content jsonb) · `progress` (subtopic_id, completed_at; unique(user_id, subtopic_id)).

**AI:** `ai_keys` (user_id, provider, encrypted_key nullable — null in device-only mode, storage_mode, last_validated_at) · `ai_rate_limits` (rolling counters).

**Community:** `forum_categories` · `threads` (category_id, author_id, type, title, slug, content jsonb, accepted_reply_id, is_pinned, is_locked, reply_count, last_activity_at) · `replies` (thread_id, author_id, content jsonb, upvote_count, is_hidden) · `reply_votes` (unique(user_id, reply_id)) · `thread_tags` / `thread_tag_links` · `thread_subscriptions` · `reports` (target_type, target_id, reporter_id, reason, status, resolver_id) · `user_sanctions` (type, expires_at, reason).

**Blog:** `blog_posts` (author_id, title, slug, excerpt, cover_path, content jsonb, category_id, status, scheduled_at, published_at) · `blog_categories` · `writer_applications` (user_id, motivation, sample_url, status).

**Jobs & resume:** `jobs` (fields per §7.7 incl. source, status, expires_at) · `job_submissions` (raw employer form + verification token) · `saved_jobs` · `resumes` (user_id, title, data jsonb, template_id) — templates defined in code.

**WhatsApp:** `wa_contacts` (phone_hash, phone_encrypted, opt_in_alerts bool) · `wa_messages` (contact_id, direction, payload jsonb, intent).

**Key relationships:** subjects 1—N chapters 1—N topics 1—N subtopics; subtopics 1—N revisions/highlights/notes/progress; threads 1—N replies; users 1—N everything they own. An ERD + full SQL migration set is a deliverable of Phase 0 (Appendix C lists the migration order).

## 10. System Architecture & Infrastructure (D16)

```
Users ──▶ Cloudflare (DNS, CDN, TLS, WAF/rate rules, R2 backups)
              │
              ▼
  VPS — 4 vCPU / 8 GB RAM / 80–160 GB NVMe (Ubuntu 24.04 LTS)
  └── Coolify (deploys, TLS via Traefik/Caddy, container mgmt)
       ├── next-app        (Node 22, Next.js standalone, SSR/ISR)
       ├── supabase stack  (Postgres 15+, GoTrue auth, PostgREST,
       │                    Realtime, Storage API + imgproxy, Kong, Studio*)
       ├── umami           (self-hosted analytics)
       └── uptime-kuma     (status monitoring)
  External: YouTube (all video) · Resend/Brevo SMTP (auth + transactional email)
            Sentry (error monitoring) · GitHub (repo + Actions CI)
            Meta WhatsApp Cloud API (Phase 4)
  *Studio and Supabase dashboard bound to a private admin hostname, IP-allow-listed.
```

**Sizing rationale (researched July 2026):** the self-hosted Supabase stack runs ~12 containers and is memory-bound; community/production guidance converges on 8 GB RAM + 4 cores + NVMe, with 4 GB viable only when optional services are disabled. Reference cost: Hetzner CX33 (4 vCPU/8 GB) ≈ €6.49/mo post-April-2026 pricing, 20 TB traffic included in EU regions; comparable specs elsewhere run ~$12–25/mo. Region (decided, v1.1): **Hetzner EU — Falkenstein or Nuremberg** — best price-per-spec with 20 TB included traffic; the ~120–150 ms path to Pakistan is mitigated by Cloudflare edge caching of public pages. Revisit only if interactive-latency metrics later demand it. Video bandwidth is entirely on YouTube.

**Ops runbook (musts):**

- **Backups:** nightly `pg_dump` (custom format) + weekly base backup + Storage bucket sync → encrypted upload to Cloudflare R2/Backblaze B2; 30-day retention; **monthly restore drill** into a scratch container (calendar-enforced). Targets: RPO ≤ 24 h, RTO ≤ 4 h.
- **Security baseline:** SSH keys only + fail2ban; UFW default-deny (80/443 + SSH); unattended-upgrades; Docker images pinned + monthly patch window; secrets only in Coolify env store; HTTPS everywhere (hard requirement for Google OAuth); Supabase JWT secret + keys rotated on any suspicion.
- **Upgrades:** self-hosted Supabase upgrades are manual — test on a scratch clone first, snapshot before, maintenance window announced in-app.
- **Scale path:** vertical resize → split Postgres to its own VPS → add a second app node behind Cloudflare LB. No Kubernetes.

## 11. Technology Stack — Decisions & Justification

### 11.1 Stack summary

| Layer            | Choice                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Framework        | **Next.js 16 (latest 16.2.x — App Router, RSC, Turbopack default)**, TypeScript 5 strict, Node 22 LTS, pnpm |
| UI               | **Tailwind CSS v4 + shadcn/ui** (components owned in-repo), lucide icons, dark/light via next-themes        |
| Editor           | **Plate** (installed via shadcn registry) — one editor family across study content, blog, forum, notes      |
| Backend          | **Supabase (self-hosted)**: Postgres, GoTrue Auth, PostgREST, Storage(+imgproxy), Realtime (used sparingly) |
| Data layer       | supabase-js + TanStack Query v5; Server Actions/route handlers for privileged mutations                     |
| Forms/validation | react-hook-form + Zod (schemas shared client/server)                                                        |
| AI               | Vercel AI SDK provider adapters (OpenAI · Anthropic · Gemini · OpenRouter · Groq), SSE streaming proxy      |
| PDF              | @react-pdf/renderer (client-side)                                                                           |
| Search           | Postgres FTS (tsvector + websearch_to_tsquery)                                                              |
| Quality          | ESLint (flat) + **Prettier** + TypeScript strict + Husky/lint-staged + Conventional Commits                 |
| Testing          | Vitest + Testing Library (unit), Playwright (e2e smoke), **pgTAP-style RLS policy tests**                   |
| Codegen          | `supabase gen types typescript` on every migration (CI-enforced drift check); Zod schema inference          |
| Observability    | Sentry (client+server, PII scrubbed), Umami, Uptime Kuma, structured pino logs                              |
| CI/CD & hosting  | GitHub Actions → Coolify webhook deploy on VPS (§10, §13.4)                                                 |

### 11.2 Why Supabase over Nhost (D1)

Both are open-source BaaS with Postgres, auth, storage, and functions, and both self-host via Docker. Supabase wins for ePharmatica on five grounds: **(1) Ecosystem & longevity** — a far larger community, documentation base, and third-party tooling, which matters when one small team owns ops for years and hires later. **(2) Access-model fit** — the app is a straightforward CRUD + RLS system; PostgREST + supabase-js serves it directly, whereas Nhost's core value (Hasura GraphQL) adds a GraphQL layer, permission DSL, and an extra always-on service we don't need — meaningful RAM on an 8 GB box. **(3) Codegen requirement** — `supabase gen types typescript` yields end-to-end typed queries with zero schema drift, integrating natively with TanStack Query; achieving the same via GraphQL codegen is possible but heavier. **(4) Postgres-native security** — RLS policies live in migrations as reviewable SQL and are testable in CI (§13.2), rather than in Hasura metadata. **(5) Team gravity** — Supabase knowledge is dramatically easier to hire/contract for in 2026. Nhost remains a respectable alternative if the product ever becomes GraphQL-first; nothing in the schema precludes migration since both are plain Postgres underneath.

### 11.3 Why Plate (D2 — recap)

MIT across everything used (including AI integration — no copyleft/paid tiers on the critical path, unlike BlockNote XL); components installed via the shadcn CLI so the editor is owned, restyled, and versioned inside the repo exactly like the rest of the design system; the largest plugin surface for the custom blocks this product needs (Drug Cards, callout taxonomy, embeds); built-in comments/suggestions powering the editorial review workflow; a single serialization (Plate JSON) for study content, blogs, forum posts, and private notes. Accepted trade-off: steeper learning curve (Slate concepts, serialization discipline) — mitigated by pinning versions, snapshot tests on renderers, and building a thin internal `@epharmatica/editor` wrapper so product code never touches Slate directly.

---

## 12. Roles & Permissions

Application roles live in `profiles.role` (single primary role) enforced by RLS + a server-side policy map; one account may additionally hold the `blog_writer` capability and the Verified Pharmacist badge (orthogonal flags).

| Role                         | Can do (summary)                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **user** (default)           | All learner features; forum participation; blog reading; job saving; resume builder; verification & writer applications |
| **blog_writer** (capability) | + create/edit own blog drafts, submit for review                                                                        |
| **author**                   | + create/edit study content drafts, submit for review, view own revision history                                        |
| **reviewer**                 | + review queues: comment/suggest, approve or request changes on study content                                           |
| **content_manager**          | + publish/unpublish/archive study content, manage taxonomy & media, rollback revisions                                  |
| **blog_editor**              | + review/publish blog posts, manage blog categories, decide writer applications                                         |
| **moderator**                | + moderation queue, hide/delete community content, warn/mute/ban users, manage forum categories/tags                    |
| **jobs_manager**             | + full jobs CRUD, approve/reject employer submissions, expiry overrides                                                 |
| **support**                  | + read-only user lookup, resolve verification queue (approve/reject badges)                                             |
| **admin**                    | + user role assignment (below admin), feature flags & settings, WhatsApp console, full audit log                        |
| **super_admin**              | + everything, incl. admin management and destructive operations (protected by confirmation + audit)                     |

Rules: least-privilege defaults; no role can edit published study content without a new revision; all admin mutations audit-logged; role changes require `admin`+ and are themselves audited.

## 13. Non-Functional Requirements & Engineering Standards

**13.1 Performance.** Budgets on mid-range Android over throttled 4G (the realistic Pakistani baseline): topic pages LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1; JS ≤ 200 KB gz on reader routes (editor/admin bundles code-split away from public routes). Techniques: ISR for all public content (revalidate on publish via tag invalidation), Cloudflare edge caching, `next/image` with sharp, lite-YouTube facades, font subsetting, streaming RSC. Lighthouse CI check on landing + one reader page in the pipeline (warn <90).

**13.2 Security.**

- **RLS on every table, deny-by-default**, with policy conventions: owner-only for study data/keys/resumes; published-only public reads for content; role-checked admin access via a `has_role()` SQL helper. **CI runs an RLS test suite** (SQL tests executed against a migrated shadow DB asserting e.g. "anon cannot read unpublished subtopics", "user A cannot read user B's notes/keys").
- Service-role key **never** leaves server context; privileged mutations only via route handlers/server actions with Zod-validated input.
- Standard headers (CSP allowing YouTube embeds, HSTS, frame-ancestors), CSRF-safe patterns, upload constraints (type/size sniffing; private buckets for verification docs), per-route rate limiting (auth, AI proxy, submissions, webhook) + Cloudflare rules.
- Secrets in Coolify env only; Sentry PII scrubbing (keys, phone numbers, emails); dependency audit (`pnpm audit` + Renovate) weekly.
- AI-specific: prompt-injection posture — model output is rendered as text/markdown only, never executed or granted tool access; user keys handled per §7.5.4.

**13.3 SEO, accessibility, i18n.** Semantic HTML + schema.org (`Article`, `JobPosting`, `BreadcrumbList`), per-route metadata + OG image generation, sitemaps (content, blog, jobs) + robots, canonical URLs, `slug_history` redirects. WCAG 2.1 AA: full keyboard support (incl. editor fallbacks), visible focus, contrast-checked tokens in both themes, reduced-motion respect, alt-text required on CMS image upload. i18n: English-only UI at launch but all strings routed through next-intl from day one; Urdu (RTL-aware layout audit) is the designated second locale (Assumption A2).

**13.4 Environments, CI/CD, codegen.**

- **Environments:** `local` (Supabase CLI stack + seed script with demo content/users per role) → `staging` (separate Supabase project/compose on the same VPS, basic-auth-gated, deploys from `develop`) → `production` (deploys from `main`).
- **Pipeline (GitHub Actions):** PR → install (pnpm cache) → Prettier check → ESLint → `tsc --noEmit` → **type-drift check** (regenerate Supabase types; fail on diff) → Vitest → build → Playwright smoke (auth, reader, gating) → preview note. Merge to `main` → build + push image → Coolify deploy webhook → post-deploy: run `supabase db push`-equivalent migration step (gated, with automatic pre-migration dump) → smoke ping → Sentry release + sourcemaps.
- **Migrations:** Supabase CLI migration files in-repo; forward-only; every migration paired with regenerated types and, where relevant, RLS tests. **Branching:** trunk-based (`main` protected, short-lived feature branches, Conventional Commits, squash merge).

## 14. Success Metrics (first 6 months post-Phase-1; targets are directional)

**North star: Weekly Active Learners** (users completing ≥1 subtopic or creating ≥1 highlight/note in a week).

- Acquisition: 5,000 registered accounts; ≥40% of new sign-ups from organic search/YouTube referral.
- Activation: ≥50% of new accounts mark ≥3 subtopics complete in week 1.
- Retention: ≥25% W4 retention among activated learners.
- Content: ≥150 published subtopics across ≥6 subjects; median review-cycle < 7 days.
- AI adoption: ≥20% of WAL configure a BYOK key; explain/summarize/chat usage tracked per feature (Umami events).
- Later phases add: threads/week & accepted-answer rate (P2), published posts/month (P2), live listings & apply-outs (P3), resumes exported (P3), WA sessions/week (P4).
  All measured via self-hosted Umami events + SQL dashboards; no third-party trackers.

## 15. Risks & Mitigations

| #   | Risk                                                                                         | Impact              | Mitigation                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Content production bottleneck** — engineering outpaces authored, reviewed syllabus content | Empty product       | Treat content as a parallel workstream with its own pipeline metrics (§14); seed 2 complete subjects before public launch; recruit student authors under reviewer supervision; Phase 1 acceptance gates on content, not just code |
| R2  | Single-VPS/single-operator failure (outage, upgrade gone wrong, bus factor)                  | Downtime, data loss | §10 runbook: tested backups + monthly restore drills, snapshots before upgrades, Uptime Kuma alerts, documented recovery playbook; accept modest HA gap consciously at this stage                                                 |
| R3  | BYOK friction — students won't fetch API keys                                                | AI features unused  | First-run wizard with screenshots per provider; order Groq/Gemini (free tiers) first; product remains fully valuable without AI                                                                                                   |
| R4  | Medical-education accuracy errors (authored or AI)                                           | Trust/harm          | Mandatory reviewer approval before publish (G6); source-citation norms in the content style guide; persistent AI disclaimers + strict grounding (§7.5.2); error-report button on every subtopic                                   |
| R5  | Moderation load / spam as community opens                                                    | Quality decay       | New-account rate limits, report→queue→sanction loop from day one of Phase 2, category-scoped moderators, content policy published before launch                                                                                   |
| R6  | Plate editor complexity (serialization bugs, upgrades)                                       | Content corruption  | Version-pinned editor wrapper package, JSON schema validation on save, renderer snapshot tests, revisions provide rollback                                                                                                        |
| R7  | Platform dependencies shift (YouTube embed policies, Meta WhatsApp pricing)                  | Feature/cost break  | Video URLs stored abstractly (player swap possible); WA phase gated on pricing re-verification (§7.9); no business logic depends on either being free forever                                                                     |
| R8  | Monetization deferred too long / retrofit pain                                               | Runway              | Entitlement gate (§7.11) wired through all premium-candidate surfaces from Phase 1; quarterly business-model review checkpoint                                                                                                    |

## 16. Assumptions & Open Questions

**Assumptions (proceed unless overridden):**

- **A1:** Web-only responsive app; PWA-ready but no install campaign in v1.
- **A2:** English UI at launch; next-intl wiring from day one; Urdu is locale #2 (timing open).
- **A3:** Assessment engine sits at Phase 5; revisit at Phase 3 planning (D6).
- **A4:** Resume PDF is client-side `@react-pdf/renderer`; ATS template is the default.
- **A5:** AI chats are session-only in v1 (no server-side conversation storage).
- **A6:** Blog comments off; discussion routed to forum threads.
- **A7 — RESOLVED:** Design system finalized in `STYLE.md` v1.2 (companion specimen `style-specimen.html`): **Pharmacopoeia** palette (teal `#0E6B63` on archival `#FBFBF9`, full dark mode), **0px** radius (boxy contract), Archivo / Instrument Sans / IBM Plex Mono, monograph-label signature, upgrades #1–#10 plus the v1.2 mobile & touch system (`STYLE.md` §6, §11). Figma pass in Phase 0 produces logo + figure-kit against these tokens.
- **A8:** Initial launch subjects: Pharmacology + Pharmaceutics (highest-demand, video-friendly) — confirm with content team.

**Open questions (status as of v1.6):**

- **Q1 — RESOLVED:** Domain is **epharmatica.com**. The YouTube channel does not yet exist; channel creation, branding, and an initial video pipeline are a Phase 0–1 content-track deliverable (see §6 continuous tracks). Release cadence commitment still to be defined by the content team.
- **Q2 — RESOLVED (v1.7):** Founder is the primary author, with most launch content already written before the build — Phase-1 content work is porting into the CMS + review, not greenfield authoring. Team at launch: founder (author/publisher) + 1 recruited author + **≥1 external licensed reviewer** (required before the first publish — the workflow forbids self-approval, M4: "author cannot approve own draft"; G6 requires independent review). Further authors under reviewer supervision are the scale-up path (R1).
- **Q3 — RESOLVED:** **Hetzner EU** (Falkenstein/Nuremberg, CX33-class). See §10.
- **Q4 — RESOLVED (v1.7):** Legal pages drafted as companion documents — Terms of Service, Privacy Policy, Content Policy, Medical Disclaimer (`terms-of-service.md`, `privacy-policy.md`, `content-policy.md`, `medical-disclaimer.md`). **Counsel review complete (19 Jul 2026).** Remaining before the pages go live: fill the bracketed operational fields (effective dates, entity name, registered address, governing city, liability cap, R2-vs-B2 and Resend-vs-Brevo picks) and remove the DRAFT headers.
- **Q5 — RESOLVED:** Semester-tag mapping is owned by the authoring **Author** (against the current HEC Pharm-D syllabus edition), verified at review (§7.2.1).

## 17. Appendices

**A. Environment variables (initial set).** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `SUPABASE_JWT_SECRET`, `DATABASE_URL` (migrations), `AI_KEYS_ENCRYPTION_KEY` (server-only, libsodium), `SMTP_*` / `RESEND_API_KEY`, `SENTRY_DSN` + `SENTRY_AUTH_TOKEN`, `UMAMI_*`, `GOOGLE_OAUTH_CLIENT_ID/SECRET` (in GoTrue config), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (Phase 4), `CRON_SECRET` (expiry/cleanup jobs).

**B. Glossary.** _Subtopic_ — atomic learning unit owning one Plate document. _Preview_ — the public, indexable head of a subtopic. _BYOK_ — bring-your-own-key; user-supplied AI provider credentials. _Accepted Answer_ — reply marked as resolving a Question thread. _Entitlement_ — server-checked capability grant, monetization-ready. _Verified Pharmacist_ — manually reviewed credential badge.

**C. Migration order (Phase 0/1 outline).** 001 extensions (pgcrypto, pg_trgm) + helpers (`has_role()`) → 002 profiles + auth trigger → 003 plans/entitlements/feature_flags → 004 content tree (subjects…subtopics) → 005 revisions + review events + slug_history → 006 study data (highlights, bookmarks, notes, progress) → 007 ai_keys + rate limits → 008 waitlist + audit_log → 009 FTS columns/indexes/triggers → 010 storage buckets + policies. Community/jobs/resume/WA migrations land in their phases. Every migration ships with RLS policies + tests + regenerated types (§13.4).

---

_End of PRD v1.0 — living document; amend via PRs with changelog entries above §1._
