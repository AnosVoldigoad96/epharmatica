# Module PRD 04 — CMS / Admin

|               |                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Module**    | CMS / Admin — the shell, content operations, media, users, settings, audit; plug-in contracts for every later module's surface  |
| **Version**   | 1.0 · 18 Jul 2026                                                                                                               |
| **Parents**   | Master PRD v1.5 (§7.10, §12) · ARCHITECTURE.md v1.1 (I2, I8) · M1 (content contract) · M2 (user admin contract) · M3 (registry) |
| **Decisions** | M4-1 … M4-5 + in-doc defaults D-a/D-b — see §2                                                                                  |
| **Phase**     | Built progressively; this doc specifies the Phase-1 build in full and the shell contracts later phases plug into                |

## 1. Scope

**In:** the `/admin` shell (navigation, permissions, density, audit conventions), full Phase-1 surfaces — content tree & editors, editorial workflow & review queue, draft preview links, media library, user administration, settings (flags, AI-model registry, site metadata), audit log — and the **surface contracts** that M5/M6/M8 admin panels must plug into. **Out:** the queue _logic_ of later modules (moderation, jobs review, verifications, WhatsApp console — their module PRDs own behavior; this doc owns where they live and the conventions they inherit) and the public reading experience (M1).

## 2. Module Decision Log

| #    | Decision                             | Choice                                                           | Consequence                                                                                                      |
| ---- | ------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| M4-1 | Tree management                      | **Per-level list editors + read-only tree rail** (B+C)           | Deliberate **Move…** flow hosts the heavyweight-move confirmations (§5.3); full DnD deferred as a luxury.        |
| M4-2 | Review routing                       | **Open queue — any reviewer claims**                             | `review_claims` table; claim/release semantics (§5.6).                                                           |
| M4-3 | Media                                | **Global searchable library with reuse**                         | Assets are first-class with usage tracking; delete-blocked-while-used (§6).                                      |
| M4-4 | Draft preview links                  | **Yes** — 7-day expiry, revocable, watermarked                   | Tokenized anon read path via security-definer RPC (§5.7).                                                        |
| M4-5 | Staff 2FA                            | **Optional for everyone**                                        | TOTP support ships; enforcement stays off. Recorded as accepted risk **R-M4a** with revisit triggers (§13, §16). |
| D-a  | Scheduled publishing (study content) | **Not in v1** (in-doc default)                                   | Publish is immediate; blog keeps its scheduler (master §7.6.2). Revisit if the content calendar demands it.      |
| D-b  | Audit retention                      | **12 months hot → yearly export to R2 → prune** (in-doc default) | §9.                                                                                                              |

## 3. User Stories (staff)

1. As an **author**, I write in the same editor readers will see rendered, watch autosave work, preview the gate exactly as an anonymous visitor will, and submit for review in one click.
2. As a **reviewer**, I open one queue, claim the oldest draft in my comfort zone, comment and suggest inline, and either approve or send it back with reasons.
3. As an **author**, I generate a preview link, WhatsApp it to an outside expert, watch the open count tick, and revoke it the moment we're done.
4. As a **content manager**, I publish an approved subtopic and the public site updates within seconds — and when a mistake ships, I roll back to any prior revision with a visible diff.
5. As a **content manager**, I reorganize a chapter knowing every consequence (redirects, highlight re-anchoring) is spelled out before I confirm.
6. As an **admin**, I flip a feature flag, edit the AI model shortlist, or assign a role — and every one of those actions is in the audit log with my name on it.
7. As any staff member, I always know where I am: the tree rail orients me, the environment banner tells me staging from production, and compact density keeps tables workable.

## 4. Admin Shell & IA

`/admin` — role-gated in `proxy.ts` **and** per-page permission map (defense-in-depth over RLS). Left nav, grouped; later-phase groups exist behind their feature flags and simply don't render until their phase:
**Dashboard · Content · Media · Users · Settings · Audit** (Phase 1) — **Blog · Community · Jobs · Verifications · WhatsApp** (later, contracts in §10). Compact density (STYLE §5.3) is the admin default; a colored environment banner marks staging; all admin routes send `noindex` and sit behind stricter rate limits. **Dashboard v1:** published / in-review / draft counts per subject vs the Phase-1 content gate, review-queue depth + oldest age, last 20 audit entries, active preview links count, quick actions.

## 5. Content Management

### 5.1 Navigation (M4-1)

Persistent **read-only tree rail**: collapsible Subject → Chapter → Topic nodes with status dots (any-draft amber / all-published teal) and published-count chips; clicking a node opens that level's **list editor** in the main pane. List editors show: name, slug, status roll-up, order (up/down + flat drag within the list), semester (topic level), updated-at, actions (Edit · Move… · Open children).

### 5.2 Metadata create/edit (per level)

Name → auto-slug (editable while nothing beneath is published; afterwards, renaming triggers the `slug_history` consequence sheet). Topic form adds `semester` and the 280-char description (M1 §5.1); subject form adds icon + default semester. Validation mirrors public constraints exactly (shared Zod schemas).

### 5.3 Move… (the deliberate cross-parent flow)

Destination picker (the same tree, legal targets only) → **consequence sheet**: old→new URL with 301 note, "N highlights will re-anchor," cache scope, sitemap effect → for published nodes, typed confirmation (`move`). Executes atomically: reparent + `slug_history` rows + tag invalidations + enqueue re-anchor job (M1 §5.5). Draft nodes move without ceremony.

### 5.4 Subtopic editor

Full Plate configuration per the M1 contract (headings, marks, lists, tables, all five callouts, image via the media picker §6, video embed with URL validation, TOC block, **Drug Card**). **Autosave** every 30s + on blur into the draft; **revisions snapshot** on submit-for-review and on publish (not every autosave). Right rail: status card, `preview_block_count` control with a live "what anonymous sees" toggle, derived read-outs (reading time, `primary_video_url` — computed at publish), semester inheritance display, revision history entry point. A **Preview** toggle renders through the real reader renderer (I4) in a resizable pane incl. a 360px width preset.

### 5.5 Editorial workflow

Statuses per master (`draft → in_review → changes_requested → approved → published`, + `archived`). Role/action matrix: authors write & submit (own drafts); reviewers comment/suggest (Plate comments), **Approve** or **Request changes** (comment required); content managers publish, unpublish (M1 §5.10 semantics), archive, roll back. **Publish** = snapshot revision → derive fields → status flip → fire cache tags → audit. **Rollback** = pick any revision → rendered side-by-side diff (old/new through the reader renderer) → restore creates a _new_ revision (never destructive) → republish path. Every transition writes `content_review_events` + `audit_log` (I8).

### 5.6 Review queue (M4-2)

One open queue: all `in_review` subtopics, oldest first, subject filter, age chip (amber > 7 days — feeds the master's review-cycle metric). **Claim** assigns the reviewer (`review_claims`), shows "claimed by" everywhere, and is releasable (self anytime; others by content_manager+). Claiming is coordination, not permission — any reviewer _may_ review, the claim just prevents collisions. Approve/Request-changes auto-release the claim.

### 5.7 Draft preview links (M4-4)

On any `draft`/`in_review`/`changes_requested` subtopic: **Create preview link** → 128-bit token, stored **hashed**, single-subtopic scope, `expires_at = now()+7d`. Per-subtopic list: token tail, creator, expiry countdown, opens count, **Revoke**. Public route `/preview/[token]` (anon-allowed): a `security definer` RPC validates hash + expiry + revocation, logs the open (`ip_hash`, UA) to `preview_link_opens`, and returns the full content JSON → rendered read-only through the real renderer with a fixed **`DRAFT — NOT PUBLISHED`** watermark bar, no study tools, `noindex, nofollow`, no site nav. Rate limit 30 opens/hr/IP; invalid/expired tokens render one neutral card ("This preview link is no longer active."). Publishing the subtopic auto-revokes its links.

## 6. Media Library (M4-3)

Global, first-class assets. **Upload:** PNG/JPG/WebP, server-side type-sniff, auto-convert/compress to WebP (max edge 1920, ≤ 2 MB post-compress), **alt text required at upload** (a11y floor — no alt, no save), optional tags. **Browse:** grid + search (filename, alt, tags), filters (uploader, unused), detail pane with dimensions and **usage** ("Used in N subtopics", each linked). Usage tracking: at publish, a content scan refreshes `media_refs(subtopic_id, asset_id)` — cheap, accurate for published content; drafts referencing an asset show as "draft uses" via a lighter periodic scan. **Replace-in-place:** uploads a new version behind the same asset id (all usages update on their next publish); the prior file is retained 30 days. **Delete:** blocked while `media_refs` exist (usages listed); unused assets soft-delete with 30-day undo. The Plate image block's picker is this library (upload-in-place lands the asset in the library, never orphaned per-subtopic files).

## 7. Users Administration

Search by username/email → user card: profile snapshot, role, verified flag, email-verified, created, deletion status. **Actions (all audited):** assign role — `admin`+ only, never to a rank ≥ your own, `super_admin` assignable only by `super_admin` with typed confirmation; **force-rename** (M2 §4.4 surface: reason required, quarantine applied, user notified); view deletion-grace list (read-only — purge cannot be expedited, by policy); sanctions panel = **contract to M5** (renders M5's sanction state; actions defined there). No password viewing/resetting on behalf of users — ever; staff can only trigger the standard reset email.

## 8. Settings

- **Feature flags:** table editor (key, description, on/off, phase tag) — powers Coming-Soon states, module nav visibility, and operational kill-switches (e.g., `highlight_kinds`, `wa_bot_enabled`). Flag flips are audited and cache-busted (`flags` tag).
- **AI model registry:** the `ai_models` editor per M3 §4.1 (add, edit, deactivate, set default, sort).
- **Site metadata:** title, description, social image, contact addresses.
- **Reserved usernames:** list editor (M2 §4.4).
- **Personal-data registry viewer:** read-only view of registered purge steps (M2 R-M2b) with last-purge-run health.

## 9. Audit Log

Every mutating admin action flows through `withAudit()` (I8): actor, action, entity type/id, before/after meta where cheap, timestamp, hashed IP. **Surface:** filterable by actor / action / entity / date range, entity deep-links, CSV export of any filter. **Retention (D-b):** 12 months hot in Postgres; a yearly cron exports the aged year to R2 (immutable object) and prunes. The audit log itself is append-only (no update/delete grants to anyone; enforced by RLS + revoked privileges, CI-tested).

## 10. Later-Phase Surface Contracts (shell obligations, behavior owned by their PRDs)

Each later module registers: a nav entry behind its flag · a permission-map block · queue pages using the shared queue components (list, claim where relevant, decision actions) · `withAudit` on every mutation · a dashboard tile. Specifically — **Blog (M5):** posts list, review, scheduler, writer-application queue. **Community (M5):** reports queue, sanction actions, category/tag management. **Verifications (M5):** application queue with signed-URL document viewer and the 90-day purge status. **Jobs (M6):** listings CRUD, submissions queue, expiry overrides, quick-add. **WhatsApp (M8):** conversation log viewer, canned responses, kill-switch. Deviating from these conventions is an architecture change (this doc is their gate).

## 11. Data-Model Deltas

- **add** `preview_links(id, subtopic_id, token_hash, created_by, expires_at, revoked_at)` · `preview_link_opens(link_id, opened_at, ip_hash, ua)`.
- **add** `media_assets(id, path, alt, tags text[], width, height, bytes, uploaded_by, replaced_at, deleted_at)` · `media_refs(subtopic_id, asset_id)`.
- **add** `review_claims(subtopic_id, reviewer_id, claimed_at, released_at)`.
- `feature_flags` gains `phase_tag`; `audit_log` as master + append-only hardening.
- TOTP: GoTrue MFA factors (no custom tables); staff enrollment UI in `/settings/sessions`.

## 12. RLS & Access

All admin tables: `has_role()`-gated per the §4 permission map; `preview_links` readable only by staff (the public path is the RPC, which never exposes the table). `media_assets` public-read for published paths (CDN), staff-write. `audit_log`: staff-read (admin+ for cross-actor queries), **no update/delete for any role**. CI adds: _reviewer cannot publish_, _author cannot approve own draft_, _audit rows immutable_, _anon preview RPC honors expiry/revocation_, _role assignment respects rank rules_.

## 13. Security Posture

Admin behind role gate + per-page map + RLS (three layers). **2FA (M4-5): TOTP fully built** (enroll/verify/recovery codes via GoTrue MFA) **but optional** — recorded as accepted risk R-M4a. Compensating controls: staff password minimum raised to 12 chars + zxcvbn ≥3, sign-in notifications for staff accounts, weekly admin-audit review habit (dashboard tile), and hard **revisit triggers**: any staff-credential incident, or staff headcount > 5 → enforcement for `admin`+ becomes a one-line config change. Preview tokens: 128-bit, hashed at rest, single-scope, auto-revoked on publish. Media uploads sniffed + size-bounded. Admin rate limits separate from public.

## 14. Acceptance Criteria (module gate)

1. Full authoring loop: create subject→…→subtopic, autosave verified, submit, claim, comment, request changes, resubmit, approve, publish — with the public page updating via tags and every transition in the audit log.
2. Rollback restores a prior revision through a visible diff and republishes; nothing destructive occurred (revision count grew).
3. Move… on a published subtopic: 301 verified, re-anchor job ran (M1 fixtures), tags fired, consequence sheet content matched reality.
4. Preview link: created → opened logged (anon session) → watermark + noindex verified at the network layer → revoked link and expired link both render the neutral card; publish auto-revokes.
5. Media: alt-required enforced; usage tracking blocks delete with accurate usage list; replace-in-place propagates on republish.
6. Review queue: claim collision prevented across two sessions; release paths work; age chip math correct.
7. Roles: rank rules enforced (attempted self-elevation and peer-elevation both fail, audited); force-rename end-to-end with quarantine.
8. Audit immutability proven (update/delete attempts fail under every role); yearly-export cron produces a valid R2 object on a seeded aged year.

## 15. Analytics

None in admin — the **audit log is the record**; Umami stays public-side only (privacy posture + signal cleanliness).

## 16. Module Risks

- **R-M4a — optional 2FA (accepted, M4-5):** a phished staff password is the worst realistic breach; mitigations + revisit triggers per §13. Owner: founder; review quarterly.
- **R-M4b — media usage-scan drift** (drafts, race between edit and scan): usage is authoritative for _published_ refs only; delete-block errs conservative (draft uses also block).
- **R-M4c — preview-link leakage:** bounded by scope/expiry/revocation/watermark; opens-log gives detection.
- **R-M4d — shell fork risk:** later modules building bespoke admin patterns → contracts in §10 are review-gated; deviations require updating this PRD.

## 17. Open Items

Sanction actions, verification decisioning, jobs/WhatsApp queue behaviors → M5/M6/M8 (shell slots reserved here). Study-content scheduling (D-a) revisits when the content calendar exists. Storybook stories for shared queue components land with S11 tooling.

_End Module PRD 04 · decisions M4-1…M4-5 (+D-a/D-b) locked · next: M5 Community._
