# ePharmatica — Engineering Rules

|                |                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Version**    | 1.0 · 19 July 2026                                                                                                                             |
| **Audience**   | Everyone writing code in this repo — human or AI                                                                                               |
| **Companions** | `development-plan.md` (sequencing) · `securities.md` (security program) · `ARCHITECTURE.md` (how & where) · `STYLE.md` (design system, locked) |

These are the working rules that keep the project coherent across phases and contributors. They compress the PRDs, ARCHITECTURE.md, and STYLE.md into enforceable practice. **When a rule here conflicts with a PRD, the PRD wins — and this file gets fixed in the same PR.**

---

## 1. Sources of truth & governance

1. Precedence on conflict: **module PRD + master changelog → Decision Log (master PRD §5, read as-amended by module decisions — e.g. M6-2 amends D14) → master PRD §7 → ARCHITECTURE.md → STYLE.md → this file.** Module PRDs are authoritative for module-level detail.
2. Breaking a load-bearing invariant (§2 below) is an **architectural change, not a refactor** — it requires a PRD/ARCHITECTURE update in the same PR.
3. Architecture changes ride the PR that implements them. A stale ARCHITECTURE.md is worse than none.
4. STYLE.md is **locked** (v1.3). The 0px radius contract is founder-final; changing it is a rebrand, not a token edit.
5. Exact numbers in PRDs (limits, windows, quotas, weights) and exact user-facing copy strings are contractual. Don't "improve" them in code; change the PRD first.

## 2. Load-bearing invariants (memorize these)

| #   | Rule                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | Every table has RLS enabled, deny-by-default. Policies live in SQL migrations (never hand-edited in Studio), covered by the CI RLS suite                                                                                                                                                                       |
| I2  | `SUPABASE_SERVICE_ROLE_KEY` is imported in exactly one module — `apps/web/lib/supabase/admin.ts` — server-only, enforced by ESLint `no-restricted-imports` + the `server-only` package. It never appears in `packages/*`                                                                                       |
| I3  | Gated content never leaves the server for anonymous sessions. Preview truncation happens in the data layer (`features/content/queries.ts`), never in CSS or client code                                                                                                                                        |
| I4  | Product code never imports `slate*`, `@udecode/*`, or Plate internals. All editor access goes through `@epharmatica/editor` — the only workspace package allowed to depend on them                                                                                                                             |
| I5  | Any feature that could ever be premium calls `can(user, feature)` on the server. No client-side entitlement trust                                                                                                                                                                                              |
| I6  | AI keys and prompts never touch logs. No `console.log` in the AI path; pino redaction + Sentry `beforeSend` scrub keys, prompt bodies, phones, emails                                                                                                                                                          |
| I7  | Migrations are forward-only, in-repo, each paired with regenerated types (CI drift check) and RLS tests. Rollback = a new forward migration                                                                                                                                                                    |
| I8  | Every mutating `/admin` action writes to `audit_log` via `withAudit()`                                                                                                                                                                                                                                         |
| I9  | One rich-text serialization: Plate JSON (`jsonb`) — study content, blog, forum, job descriptions, notes. Renderers vary; the format does not                                                                                                                                                                   |
| I10 | Outbound side effects (email, WhatsApp, future payments) go through `lib/integrations/*` server modules only — never from components or client code                                                                                                                                                            |
| I11 | **The `unusedmind` containers on the shared Hetzner server (`unusedmind-web`, every `nhost-unusedmind-*`) are OFF-LIMITS to this project — never stop, restart, modify, inspect data of, or reclaim resources from them.** They belong to an unrelated product sharing the box (founder decision, 19 Jul 2026) |

## 3. Monorepo rules

The repo is a **pnpm-workspaces + Turborepo monorepo** with one deployable app. (Founder decision, 19 Jul 2026; ARCHITECTURE.md §3.2 codemap amended accordingly.)

1. **One deployable: `apps/web`.** Adding a second app requires an ADR + ARCHITECTURE.md update — it is an architecture change, not a folder.
2. **Package roster and ownership:**
   - `@epharmatica/tokens` — Style Dictionary source (`tokens/*.json`) and its build outputs. Tokens are edited **only** in the JSON, never in CSS.
   - `@epharmatica/ui` — shadcn-owned primitives + the 13 system primitives + Storybook. All visual components live here or in `apps/web/features/*/components`; nothing visual in other packages.
   - `@epharmatica/editor` — the Plate wrapper (I4): config, block schema, `<RichText/>`, serializers, `getTextRuns`. The **only** package with `slate*`/`@udecode/*` in its dependencies.
   - `@epharmatica/database` — generated Supabase types (never hand-edited; CI drift check) + shared Zod schemas (validated on client and server from the same schema).
   - `@epharmatica/config` — shared tsconfig/ESLint/Prettier. Every workspace extends it; no workspace redefines lint or TS strictness locally.
3. **Import direction is one-way:** `apps/web` → `packages/*`; `ui` → `tokens`; `editor` → `ui`/`tokens`. Packages never import from `apps/*`, and never from each other outside that graph. Cross-feature imports inside `apps/web` go through the feature's public `index.ts`.
4. **Server-boundary code stays in the app.** Supabase clients, entitlements, integrations, observability live in `apps/web/lib/*` — packages must be runtime-agnostic (importable in RSC, client, and test contexts) and contain no secrets, no env access, no service-role code.
5. Internal packages use the workspace protocol and are transpiled by the app build. **No npm publishing**, no separate versioning — the monorepo versions as one.
6. CI runs through Turborepo (`turbo build/lint/typecheck/test`) with caching; a change in a package must rebuild/retest its dependents (never skip dependents by hand-filtering).

## 4. Application architecture rules

1. **RSC-first.** Pages are Server Components; `"use client"` only at interaction leaves (editor surfaces, highlight layer, AI panel, forms, vote buttons).
2. Route strategy: marketing/legal = static; public learn/blog/jobs = ISR with cache tags revalidated on publish; anything cookie-personalized = dynamic. **Next tags are the source of truth; Cloudflare only shortens the path to them.**
3. Mutations: Server Actions for form-shaped same-app mutations; route handlers for streaming (AI/SSE), webhooks, cron, non-React clients. Both validate input with the shared Zod schemas.
4. Three Supabase clients, never mixed: browser (anon, client components), server (anon + user cookie JWT, RSC/actions), admin (service-role, trusted server modules only per I2).
5. Client server-state via TanStack Query v5, query keys namespaced per feature (`['study','progress',subjectId]`); RSC data passed down — no double-fetching. Realtime is used sparingly (admin queue badges); nothing user-facing depends on it in v1.
6. A feature's SQL lives in migrations, its access logic in `features/<x>/queries|mutations.ts`, its UI in `features/<x>/components`; pages only compose features.
7. Framework pin: Next.js 16, always latest 16.2.x patch. **No custom webpack config is permitted** (Turbopack default).
8. Rate limits are table-backed sliding windows in Postgres (single-node ⇒ no Redis). Cloudflare rules are the coarse outer layer only.

## 5. Data & migration rules

1. All tables `snake_case`, UUID PKs, `created_at`/`updated_at`, RLS enabled (I1).
2. Every migration ships in the same PR with: regenerated types in `@epharmatica/database`, RLS policies, and RLS tests where relevant (I7).
3. New tables must fit one of the three RLS archetypes (owner-only / public-read-published + staff-write / participant-write with moderation override) before inventing a fourth — see `securities.md` §4.
4. **Any table containing `user_id` must register its purge step in `personal_data_registry`** — CI fails otherwise (M2 R-M2b). The M2 §4.7 purge order is contractual with the Privacy Policy.
5. Slugs are stable, lowercase, hyphenated; renames create `slug_history` rows and 301s — at every level of the content tree.
6. Content visibility is one recursive read-query rule (≥1 published descendant), never status flags on parent rows (M1-6).
7. Publishing snapshots a revision first; rollback restores by creating a **new** revision — never destructive.
8. Progress/count roll-ups are computed at read time in v1 — no denormalized counters until profiling demands them.
9. Forum public reads go **only** through the `threads_public`/`replies_public` security-barrier views (anonymity boundary, M5 §10). Base-table selects are revoked.

## 6. Editor rules (Plate)

1. All editor and renderer access via `@epharmatica/editor` (I4). If you're importing a Slate type in product code, you're doing it wrong.
2. One serialization: Plate JSON (I9). Configs vary by surface (full for study/blog, trimmed for forum, marks+lists only for notes) but the block schema is owned centrally.
3. Every block type must implement `getTextRuns(path)` — the highlight anchor machinery depends on it (M1-4).
4. Renderer changes require the snapshot test suite across the whole block schema to pass (risk R6).
5. JSON schema validation on save; a Plate document that fails validation never reaches the database.
6. Version-pin the editor; upgrades are deliberate events with the full fixture suite as the gate.

## 7. Design system & UX rules (from STYLE.md v1.3 — locked)

1. **0px radius on everything.** No pills, circles, shadowed cards, or gradients. The one permitted curve is the capsule glyph in the brand mark.
2. Tokens are edited only in `@epharmatica/tokens` JSON. Raw hexes exist exactly once, in the generated `@theme`. Semantic tokens only in components.
3. Monograph labels (IBM Plex Mono 11px uppercase +0.12em above a 1px rule) are the signature — section eyebrows, card headers, form labels, table headers, captions.
4. One shadow (overlays only). No spinners — skeletons with 1.2s opacity pulse + the 2px route bar. No page transitions (S10); navigation is instant.
5. Mobile-first at 360px; components respond to their **container**, not the viewport. Touch targets ≥44px behind `@media (pointer:coarse)`; hover affordances behind `@media (hover:hover)`; compact density never on touch.
6. Numeric data is always mono + `tabular-nums`. Content links always underlined (S6). Status colors are functional, never decorative. Highlighter colors are the user's layer, never product emphasis.
7. Buttons are verb-first and say what happens (`Save note`, `Mark complete` — never `Submit`/`OK`), and keep their name through the flow. Sentence case everywhere except monograph labels.
8. Zero CLS budget on mobile: all media declare `aspect-ratio`; skeletons reserve true heights.
9. The only celebration is the completion stamp. No streaks, no confetti, no gamification beyond it.
10. RTL-safe from the first component: logical properties only (`ms-/me-/ps-/pe-`, `text-start/end`), no direction-baked assets.
11. Exact user-facing copy specified in PRDs (cap messages, gate copy, WhatsApp strings, consent lines) is contractual — copy it verbatim, add it to the next-intl catalog, and test against it.

## 8. i18n & accessibility rules

1. Every user-facing string goes through next-intl from day one — no hardcoded strings in JSX, even though launch is English-only (Urdu is locale #2).
2. WCAG 2.1 AA floor: full keyboard support, visible square focus, AA contrast in both themes, reduced-motion respected, alt text required at upload (the media library enforces it).
3. Color is never the sole signal; state glyphs pair with text or `aria-label`; collapsed disclosure semantics for tap-to-reveal content (e.g. Quiz-me answers).
4. Dark mode is first-class: every surface is built and reviewed in both themes; `forced-colors: active` keeps 1px borders.

## 9. Testing & CI rules

1. Test pyramid: Vitest unit (schemas, entitlements, serializers) · SQL RLS suite against a migrated shadow DB · renderer snapshot tests · Playwright happy-paths (auth, reader, anon gate at network layer; AI against a mock adapter).
2. The PR pipeline is the gate: Prettier → ESLint → `tsc --noEmit` → type-drift check → Vitest → build → Playwright smoke. Red pipeline = no merge. Never skip hooks.
3. Module acceptance criteria (each PRD's acceptance section) are the test plan — write them as tests, don't reinterpret them.
4. Time-dependent behavior (14-day purge, 24 h sessions, 15-min edit windows, 90-day purges, daily AI caps) is tested with a controlled clock, including both sides of the boundary (e.g. 14:59 vs 15:01).
5. Security probes listed in `securities.md` §5 are non-negotiable CI members — a feature that lands without its probes is incomplete.
6. Performance budgets are CI-checked (Lighthouse on landing + one reader route; warn <90). Reader-route JS ≤ 200 KB gz — editor/admin bundles stay code-split away from public routes.

## 10. Git & workflow rules

1. Trunk-based: `main` protected, short-lived feature branches, **Conventional Commits**, squash merge. `develop` deploys to staging; `main` to production.
2. Forward-only migrations ride their feature PR (never a separate "migrations PR" that can drift).
3. Every PR description notes: invariants touched (if any), migrations included, flags added/flipped, and PRD sections implemented.
4. Weekly `pnpm audit` + Renovate; Docker images pinned with a monthly patch window.
5. Feature flags gate incomplete surfaces — merge early behind a flag rather than long-lived branches. Flag flips are audited and bust the `flags` cache tag.

## 11. Observability & analytics rules

1. Structured pino logs with the I6 redaction list; no `console.log` in server code paths.
2. Umami events are constants in `lib/observability/events.ts` — no ad-hoc strings; events carry **no PII**; each module implements its PRD's exact event taxonomy.
3. No analytics in `/admin` (the audit log is the record) and none in the WhatsApp module (server-side aggregates only).
4. Sentry on client + server with release tagging from CI and `beforeSend` scrubbing per `securities.md` §13.

## 12. Admin & audit rules

1. Every feature ships with its admin surface (product principle 6). Nothing reaches production without CMS controls to manage it.
2. Later-phase admin panels plug into the M4 §10 shell contracts (nav behind flag, permission-map block, shared queue components, `withAudit`, dashboard tile). Deviating is an architecture change gated on the M4 PRD.
3. `audit_log` is append-only — no update/delete grants to anyone, CI-tested.
4. Role rules: least privilege; admin+ assigns roles, never to a rank ≥ their own; super_admin only by super_admin with typed confirmation; staff can never view or set user passwords.
5. Nobody edits published study content without a new revision.

## 13. Definition of Done (per feature)

A feature is done when **all** of these hold:

- [ ] Module PRD acceptance criteria implemented as passing tests
- [ ] Migrations + regenerated types + RLS policies + RLS/CI probes shipped together
- [ ] Any new `user_id` table registered in `personal_data_registry`
- [ ] Admin surface (or M4 shell slot) exists; mutating admin actions use `withAudit()`
- [ ] Feature flags wired where the PRD specifies gating; entitlement gate (`can()`) on premium-candidate surfaces
- [ ] Analytics events from the PRD's taxonomy, as constants, PII-free
- [ ] Exact PRD copy strings used verbatim, routed through next-intl
- [ ] Both themes, 360px-first, touch targets, keyboard path, alt text, RTL-safe (logical properties only, no direction-baked assets) — checked
- [ ] Performance budget respected on the affected routes
- [ ] Cron jobs (if any) are idempotent, `CRON_SECRET`-guarded, and log a run record
- [ ] Docs updated if behavior or architecture changed (same PR)

## 14. PR checklist (copy into the description)

```
- [ ] PRD section(s): …
- [ ] Invariants touched: none / I…
- [ ] Migrations: none / 0NN_… (types regenerated, RLS tests included)
- [ ] Flags: none / added … / flipped …
- [ ] Security probes added/updated per securities.md §5: n/a / …
- [ ] Copy: exact PRD strings verified
- [ ] RTL-safe: logical properties only, no direction-baked assets (STYLE S11 review-checklist mandate)
- [ ] Tested: unit / RLS / snapshot / e2e as applicable; clock-controlled where time-dependent
```
