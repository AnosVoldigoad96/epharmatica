# ARCHITECTURE.md — ePharmatica

> **Audience:** engineers contributing to this codebase. Read this before your first PR.
> **Version:** 1.1 · aligned to **PRD v1.2** (18 Jul 2026). The PRD defines _what and why_; this document defines _how and where_. When they conflict, the PRD's Decision Log (PRD §5) wins — update both in the same PR.
> **Pending amendment (PRD v1.7, 19 Jul 2026):** the repo is re-scoped to a **pnpm + Turborepo monorepo** — `apps/web` plus `@epharmatica/tokens`/`ui`/`editor`/`database`/`config` packages; §3.2's codemap will be rewritten as **v1.2** in the Phase-0 scaffolding PR. Invariants, data-access layers, and deployment topology (one Next.js container) are unchanged; `lib/editor` becomes the `@epharmatica/editor` package (I4 unchanged in intent, now a package boundary). See `development-plan.md` §2 for the interim layout.

---

## 1. System Overview

ePharmatica is a **single Next.js application** backed by a **self-hosted Supabase stack**, deployed as containers on **one Hetzner EU VPS** behind **Cloudflare**. One app serves four surfaces: the public marketing/learn pages, the authenticated learner app, the community, and the `/admin` CMS. There is no separate backend service — privileged logic lives in Next.js server code (route handlers / server actions) and in Postgres itself (RLS, triggers, functions).

```
                        ┌──────────────────────────────────────────────┐
 Users ── HTTPS ──▶ Cloudflare (DNS · CDN · TLS · WAF · cache rules)   │
                        └──────────────────┬───────────────────────────┘
                                           ▼
        VPS · Hetzner EU (Falkenstein/Nuremberg) · 4 vCPU / 8 GB / NVMe · Ubuntu 24.04
        Coolify → Traefik (TLS, routing) — only :80/:443 exposed
        ┌───────────────┬──────────────────────────────┬───────────┬──────────────┐
        │ next-app      │ supabase stack               │ umami     │ uptime-kuma  │
        │ Node 22       │ Postgres · GoTrue · PostgREST│ analytics │ monitoring   │
        │ SSR / ISR     │ Realtime · Storage+imgproxy  │           │              │
        │               │ Kong · Studio (private host) │           │              │
        └───────────────┴──────────────────────────────┴───────────┴──────────────┘
        External: YouTube (video) · Resend/Brevo (SMTP) · Sentry · GitHub Actions
                  Meta WhatsApp Cloud API (Phase 4) · user-chosen AI providers (BYOK)
```

Everything app-to-Supabase happens on the **internal Docker network**; only Traefik is exposed. Supabase Studio and the Kong admin surface bind to a private hostname, IP-allow-listed at Cloudflare + UFW (PRD §10).

---

## 2. Load-Bearing Invariants

These are the rules the architecture depends on. Breaking one is an architectural change, not a refactor — it needs a PRD/ARCHITECTURE update in the same PR.

| #       | Invariant                                                                                                                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I1**  | **Every table has RLS enabled, deny-by-default.** Policies live in SQL migrations (never hand-edited in Studio) and are covered by the CI RLS test suite.                                                                                                  |
| **I2**  | `SUPABASE_SERVICE_ROLE_KEY` is imported in exactly one module — `lib/supabase/admin.ts` — and that module is only imported from server-only admin/job code. Enforced by an ESLint `no-restricted-imports` rule + `server-only` package.                    |
| **I3**  | **Gated content never leaves the server for anonymous sessions.** Preview truncation happens in the data layer (`features/content/queries.ts`), not in CSS or client code.                                                                                 |
| **I4**  | Product code never imports `slate*`, `@udecode/*`, `platejs`/`@platejs/*`, or Plate internals directly. All editor/render access goes through **`lib/editor`** (the `@epharmatica/editor` wrapper). This is our blast-shield for editor upgrades (PRD R6). |
| **I5**  | Any feature that could ever be premium calls **`can(user, feature)`** from `lib/entitlements` on the server. No client-side entitlement trust (PRD §7.11).                                                                                                 |
| **I6**  | **AI keys and prompts never touch logs.** No `console.log` in the AI path; pino redaction + Sentry `beforeSend` scrub `authorization`, `x-api-key`, `apiKey`, prompt bodies, phone numbers, and emails.                                                    |
| **I7**  | Migrations are **forward-only**, in-repo (`supabase/migrations`), each paired with regenerated types (CI drift check) and RLS tests where relevant. Rollback = new forward migration.                                                                      |
| **I8**  | Every mutating `/admin` action writes to `audit_log` via the `withAudit()` helper.                                                                                                                                                                         |
| **I9**  | **One rich-text serialization: Plate JSON (`jsonb`).** Study content, blog posts, forum posts, job descriptions, and private notes all use it. Renderers vary; the format does not.                                                                        |
| **I10** | Outbound side effects (email, WhatsApp sends, future payments) go through `lib/integrations/*` server modules only — never called from components or client code.                                                                                          |

---

## 3. Application Architecture (Next.js)

### 3.1 Rendering model

- **Framework pin: Next.js 16** — always the latest 16.2.x patch (security backports land there). Turbopack is the default bundler; **no custom webpack config is permitted** in this repo, which removes the main 15→16-class migration hazard by construction.
- **RSC-first.** Pages are React Server Components; client components (`"use client"`) exist only at interaction leaves (editor surfaces, highlight layer, AI panel, forms, vote buttons).
- **Route strategy:**
  - `(marketing)` + legal pages → **static** (SSG).
  - Public learn/blog/jobs pages → **ISR** with cache tags, revalidated on publish (see §6).
  - Anything cookie-personalized (dashboard, settings, admin, community when signed-in) → **dynamic**.
- **Mutations:** Server Actions for form-shaped, same-app mutations; **route handlers** for streaming (AI/SSE), webhooks (WhatsApp), cron endpoints, and anything called by non-React clients. Both validate input with shared Zod schemas (I5 applies).

### 3.2 Codemap

```
epharmatica/
├── app/
│   ├── (marketing)/            # landing, about, legal — static
│   ├── (learn)/                # /learn/**, /search — ISR public + gated reader
│   ├── (account)/              # /dashboard, /settings/**, /resume, /verify-pharmacist
│   ├── (community)/            # /community/**, /blog/**, /u/[username], /jobs/**
│   ├── admin/                  # CMS — role-gated in layout + proxy
│   └── api/
│       ├── ai/route.ts         # BYOK streaming proxy (SSE)
│       ├── whatsapp/webhook/route.ts
│       ├── cron/[job]/route.ts # expiry, purges — CRON_SECRET-guarded
│       └── og/[...]/route.tsx  # OG image generation
├── components/
│   ├── ui/                     # shadcn/ui primitives (owned, restyled)
│   └── shared/                 # app-level composites (nav, cards, badges)
├── features/                   # vertical slices — the unit of ownership
│   ├── content/                # tree, queries (preview gate lives HERE), publish, revisions
│   ├── study/                  # highlights, notes, bookmarks, progress
│   ├── ai/                     # provider adapters, key vault, rate limit, prompts
│   ├── forum/  blog/  jobs/  resume/  verification/  whatsapp/  entitlements/
│   └── <feature>/{queries.ts, mutations.ts, schemas.ts, components/, hooks.ts}
├── lib/
│   ├── supabase/{client.ts, server.ts, admin.ts}   # see §3.3
│   ├── editor/                 # @epharmatica/editor: plate config, block schema,
│   │                           #   <RichText/> read renderer, serializers (I4)
│   ├── entitlements/can.ts
│   ├── integrations/{email.ts, whatsapp.ts}
│   ├── observability/{logger.ts, events.ts}        # pino + Umami event names
│   └── utils/
├── supabase/
│   ├── migrations/             # 001_… forward-only (PRD Appendix C)
│   ├── tests/                  # RLS assertions (SQL), run in CI
│   └── seed/                   # demo subjects, users per role
├── e2e/                        # Playwright smoke: auth, reader, gating, AI mock
├── types/database.ts           # generated — never hand-edited (CI drift check)
└── docs/                       # PRD, this file, runbooks, ADR notes
```

**Rule of thumb:** a feature's SQL lives in migrations, its access logic in `features/<x>/queries|mutations.ts`, its UI in `features/<x>/components`, and pages only compose features. Cross-feature imports go through the feature's public `index.ts`.

### 3.3 Data-access layers (three Supabase clients, never mixed)

| Client        | File                     | Key                                      | Runs                             | Use for                                                      |
| ------------- | ------------------------ | ---------------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| Browser       | `lib/supabase/client.ts` | anon                                     | client components                | user-owned reads/writes under RLS (highlights, votes, notes) |
| Server (user) | `lib/supabase/server.ts` | anon + user cookie JWT (`@supabase/ssr`) | RSC, server actions              | anything on behalf of the signed-in user — still RLS-bound   |
| Admin         | `lib/supabase/admin.ts`  | service-role                             | trusted server modules only (I2) | publish pipeline, cron jobs, webhook handlers, moderation    |

Client-side server state uses **TanStack Query v5** with query keys namespaced per feature (`['study','progress',subjectId]`); RSC data is fetched directly and passed down — no double-fetching. Realtime is used **sparingly** (admin queues badge counts); nothing user-facing depends on it in v1.

---

## 4. Data Architecture

Schema domains and field lists live in **PRD §9**; migration order in **PRD Appendix C**. What matters architecturally:

### 4.1 RLS conventions (I1)

Three policy archetypes cover ~90% of tables — new tables should fit one before inventing a fourth:

```sql
-- (a) owner-only rows: study data, ai_keys, resumes, saved_jobs …
create policy owner_all on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- (b) public-read of published content; writes only via roles
create policy public_read_published on public.subtopics
  for select using (status = 'published');
create policy staff_write on public.subtopics
  for all using (public.has_role(array['author','content_manager','admin','super_admin']))
  with check (public.has_role(array['author','content_manager','admin','super_admin']));

-- (c) participant-write community rows with moderation override
create policy author_insert on public.replies
  for insert with check (auth.uid() = author_id and not public.is_sanctioned(auth.uid()));
```

`has_role()`, `is_sanctioned()`, and `can_feature()` are `security definer` SQL helpers created in migration 001. **The preview gate is not an RLS concern** — anonymous users may `select` published subtopics; truncation to `preview_block_count` happens in `features/content/queries.ts` (I3), so SEO metadata can still be computed server-side from full content.

### 4.2 Content, revisions, search

- `subtopics.content` (Plate JSON) is the source of truth. On every save, a trigger refreshes `plain_text` (block-walk extraction) → `search_vector` (`tsvector`, weighted title A / headings B / body C).
- **Publishing** snapshots into `content_revisions` before flipping `status`; rollback = copy a revision back (new revision, never destructive) (I7 spirit).
- Search = Postgres FTS with `websearch_to_tsquery`, filtered by subject/semester. Meilisearch is a _drop-in future container_, not a v1 dependency — the query layer isolates this behind `features/content/search.ts`.

### 4.3 Storage buckets

| Bucket              | Access                              | Contents                             | Lifecycle                        |
| ------------------- | ----------------------------------- | ------------------------------------ | -------------------------------- |
| `content-media`     | public-read via CDN                 | study/blog images (imgproxy-resized) | permanent                        |
| `avatars`           | public-read                         | user avatars                         | replaced on upload               |
| `verification-docs` | **private**, staff-only signed URLs | license/degree scans                 | cron purge 90 days post-decision |
| `covers`            | public-read                         | blog covers, OG assets               | permanent                        |

---

## 5. Key Flows

**Public topic read.** Request → Cloudflare cache (HIT for anon) → miss: Next ISR page → `getSubtopicForViewer(viewer)` returns full JSON for members, truncated JSON + gate marker for anon (I3) → `<RichText/>` renders read-only Plate JSON → lite-YouTube facade hydrates on click.

**Study-tool write (highlight).** Client component → browser Supabase client insert → RLS archetype (a) authorizes → TanStack Query cache update. No server hop; Postgres is the authority.

**Auth.** GoTrue (email+password w/ verification, Google OAuth). `@supabase/ssr` keeps the session in httpOnly cookies; `proxy.ts` (Next 16's rename of `middleware.ts`) refreshes tokens and hard-blocks `/admin/**` without a staff role (defense-in-depth on top of RLS). Google OAuth requires the HTTPS origin — Traefik terminates TLS (PRD §13.2).

**Publish (CMS).** Editor (Plate via `lib/editor`) → server action `publishSubtopic()` [admin client]: workflow-state check → revision snapshot → `status='published'` → `revalidateTag` cascade (§6) → `audit_log` via `withAudit()` (I8).

**AI request (BYOK).** Client sends prompt + key reference → `POST /api/ai` route handler: (1) session check, (2) sliding-window rate limit in Postgres (`ai_rate_limits`), (3) resolve key — from request header (_device-only_ mode) or decrypt `ai_keys.encrypted_key` with `AI_KEYS_ENCRYPTION_KEY` (_sync_ mode; libsodium sealed-box), (4) build grounded prompt from topic Markdown serialization, (5) stream via Vercel AI SDK adapter (OpenAI/Anthropic/Gemini/OpenRouter/Groq) as SSE, (6) nothing persisted; key held in request scope only (I6). Output is rendered as markdown text — never executed, no tools (PRD §13.2).

**WhatsApp webhook (Phase 4).** Meta → `POST /api/whatsapp/webhook` → signature verify (`WHATSAPP_APP_SECRET`) → intent router (menu state machine + FTS topic lookup, **no LLM**) → reply via Graph API through `lib/integrations/whatsapp.ts` (I10) → log to `wa_messages` (90-day cron purge). Inbound-only; a kill-switch feature flag short-circuits the router.

**Cron.** Coolify scheduled tasks hit `GET /api/cron/{job}?token=CRON_SECRET`: `jobs-expire`, `purge-verification-docs`, `purge-wa-logs`, `backup-verify-ping`. Idempotent by design; each logs a run record.

---

## 6. Caching & Revalidation Map

| Tag                             | Invalidated by                    | Pages affected                                   |
| ------------------------------- | --------------------------------- | ------------------------------------------------ |
| `subtopic:{id}`                 | publish/rollback of that subtopic | its reader page                                  |
| `topic:{id}` / `subject:{slug}` | child publish, reorder, rename    | topic page, chapter list, subject index, sitemap |
| `blog` / `blog:{slug}`          | blog publish/schedule fire        | blog index, post, author page                    |
| `jobs`                          | listing publish/expiry cron       | jobs index, job page, jobs sitemap               |
| `flags`                         | admin settings change             | landing (Coming-Soon states), nav                |

Cloudflare: cache-everything for anon on public routes with `Bypass on cookie: sb-*`; HTML respects Next's revalidation; images/fonts long-max-age immutable. Rule of thumb: **Next tags are the source of truth; Cloudflare only shortens the path to them.** Next 16's Cache Components (`"use cache"`, `cacheTag`, `cacheLife`) may be adopted per surface where profiling justifies it — the tag map above remains the invalidation contract either way.

---

## 7. Cross-Cutting Concerns

- **Observability.** `lib/observability/logger.ts` (pino, structured, redaction list per I6) → stdout → Coolify logs. Sentry on client+server with release tagging from CI. Umami events are constants in `events.ts` (`ai_explain_used`, `subtopic_completed`, …) — no ad-hoc strings.
- **Rate limiting.** Table-backed sliding windows (single-node ⇒ no Redis needed): auth attempts, AI proxy, employer submissions, webhook, new-account community caps (PRD §7.6.1). Cloudflare rules add a coarse outer layer.
- **Error surfaces.** Route-group `error.tsx` boundaries; AI panel and WhatsApp router degrade gracefully (feature-flag kill-switches).
- **i18n.** All strings through `next-intl` from day one; English-only catalog at launch; RTL audit lands with Urdu (PRD A2).
- **Accessibility & perf budgets** are CI-checked (Lighthouse on landing + one reader route); editor/admin bundles are route-group code-split so public routes stay ≤ 200 KB gz (PRD §13.1).

---

## 8. Environments, CI/CD, Testing

- **Envs:** `local` (Supabase CLI + seed) → `staging` (second compose project on the same VPS, basic-auth) → `production`. Config only via env (Coolify store); see PRD Appendix A.
- **Pipeline (GitHub Actions):** PR = Prettier → ESLint → `tsc --noEmit` → **type-drift check** (`supabase gen types` must produce no diff) → Vitest → build → Playwright smoke. `main` = image build → Coolify webhook deploy → gated migration step (auto pre-migration dump) → smoke ping → Sentry release. (PRD §13.4.)
- **Testing pyramid:** Vitest unit (schemas, entitlements, serializers) · **SQL RLS suite** in `supabase/tests` against a migrated shadow DB (I1) · renderer snapshot tests for `<RichText/>` across the block schema (R6) · Playwright happy-paths incl. the anon preview gate; AI e2e runs against a mock provider adapter.

---

## 9. Evolution Points (designed-in, not built)

| Future need             | Plug-in point                                                      | Nothing else changes                            |
| ----------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| Cross-topic RAG         | `pgvector` migration + retrieval step in `features/ai/prompts.ts`  | provider adapters, proxy route                  |
| Better search relevance | Meilisearch container behind `features/content/search.ts`          | callers                                         |
| Payments/monetization   | gateway module in `lib/integrations` writing `entitlements`        | every `can()` call site (I5)                    |
| Scale-out               | Postgres to its own VPS → 2nd `next-app` node behind Cloudflare LB | app code (stateless; rate limits already in PG) |
| Assessments (P5)        | new `assessment` feature slice + tables                            | reader integration via existing subtopic IDs    |

---

## 10. Changing This Document

Architecture changes ride the PR that implements them: update the relevant section here, reference the PRD decision (or add one to its Decision Log), and note breaking invariant changes in the PR description. Small clarifications are fair game anytime — a stale ARCHITECTURE.md is worse than none.

_Companions: `docs/epharmatica-prd.md` (v1.1) · ops runbook (PRD §10) · legal drafts._
