# Module PRD 02 — Accounts & Profiles

| | |
|---|---|
| **Module** | Accounts & Profiles (auth · identity · profile · settings · deletion · export) |
| **Version** | 1.0 · 18 Jul 2026 |
| **Parents** | Master PRD v1.5 (§7.3) · ARCHITECTURE.md v1.1 · STYLE.md v1.3 · Privacy Policy draft |
| **Decisions** | M2-1 … M2-6 — see §2 |
| **Phase** | 1 |

## 1. Scope

**In:** sign-up/sign-in (email+password, Google), identity auto-linking, username system, profile data & editing, settings IA (profile · appearance · AI keys pointer · data · sessions), the deletion state machine, study-data export, and the Phase-2 visibility flag + prompt contract. **Out (owned elsewhere):** public profile *pages* and the Verified-Pharmacist application/review flow (M5 — this module only stores `is_verified_pharmacist`, `verified_at`, and `visibility`), AI-key management UI internals (M3), admin user management (M4).

## 2. Module Decision Log

| # | Decision | Choice | Consequence |
|---|---|---|---|
| M2-1 | Username policy | **Immutable** — chosen once at signup | Weighty signup step (§4.1); no redirect plumbing ever; admin **force-rename** escape for policy violations (§4.4) with 90-day handle quarantine. |
| M2-2 | Deletion model | **14-day soft-delete grace → purge** | Deletion is a state machine (§4.7); signing in during grace auto-cancels; day-14 cron purges in the Privacy-Policy order (AI keys first). |
| M2-3 | Sessions | **"Sign out everywhere" only** | Global refresh-token revocation incl. the current session (§4.8); no per-device list in v1. |
| M2-4 | Same-email Google + password | **Auto-link on verified email match** | Link requires *both* sides verified — unverified local email blocks auto-link with a verify-first prompt (§4.3); closes the takeover vector. |
| M2-5 | Data export | **Study data JSON** (highlights, notes, progress, bookmarks) | Schema in §4.9; community-content export deferred to M5. |
| M2-6 | Phase-2 visibility default | **One-time choice prompt** at Phase-2 first sign-in | `visibility: unset\|public\|private` stored now (§4.10); no dark default. |

## 3. User Stories

1. As a new student, I create an account in under a minute with email or Google, pick a username I'm told is permanent, and land back exactly where I was reading.
2. As a Google user, I'm asked once to choose my username before anything else — the account isn't "half-created."
3. If I signed up with email and later tap "Continue with Google" on the same address, I end up in my one account, and I'm notified a sign-in method was added.
4. I edit my display name, avatar, country, institution, and bio anytime — but the interface never pretends my username can change.
5. I can download everything I've studied — highlights with their text, my notes, progress, bookmarks — as one JSON file.
6. If I delete my account and regret it within two weeks, signing back in restores everything with a clear notice; after two weeks, it's genuinely gone.
7. If a device is lost, one button signs me out everywhere.

## 4. Functional Specification

### 4.1 Sign-up — email
Fields: email, password (min 10 chars, zxcvbn score ≥2, no composition rules), **username** (live availability, rules §4.4, with the standing line *"Your username is permanent and can't be changed."*), display name, and a required 13+ confirmation checkbox (Terms/Privacy links). Cloudflare **Turnstile** guards the form. Submit → account created unverified → verification email → banner until verified. Unverified accounts can read gated content and set progress, but **cannot** post to future community surfaces or auto-link (§4.3); a 7-day unverified account with zero activity is eligible for cleanup.

### 4.2 Sign-up / sign-in — Google
OAuth via GoTrue. First-time Google users hit a mandatory **completion step** (username + user type + 13+ checkbox) before entering the app — profile row is created only on completion; abandoning it leaves a resumable pending state. Google-provided email counts as verified. Sign-in for existing users is one tap.

### 4.3 Identity auto-linking (M2-4)
Google sign-in where a local account exists with the **same, verified** email → identities link into that account; notification email: *"Google was added as a sign-in method for your ePharmatica account."* If the local email is **unverified**: no link — the flow stops with *"An account with this email exists but isn't verified. Verify it first, then sign in with Google to connect them."* Unlinking (Settings → Sessions & sign-in): a method can be removed only if another remains; removing the password requires Google linked, and vice-versa; removing Google with no password set forces set-password first. All link/unlink events are notified by email.

### 4.4 Username system (M2-1)
Rules: 3–20 chars, `a–z 0–9 _ -`, must start/end alphanumeric, lowercase-canonical, uniqueness case-insensitive. **Reserved list** (routes + brand): `admin, api, app, auth, blog, community, dev, epharmatica, help, jobs, learn, legal, resume, search, settings, support, system, u, verify, whatsapp` (+ growable table). **Immutable** for users. **Admin force-rename** (M4 surface): reason required, audit-logged, user notified by email with the new system-assigned handle (`user-{shortid}`) and a support contact; the old handle enters `handle_quarantine` for **90 days** (unclaimable), then frees.

### 4.5 Profile fields & editing
Display name 2–50 chars · avatar (client square-crop → WebP 512px, ≤1 MB post-crop, server type-sniffed, bucket `avatars`, previous file replaced) · user type `student|pharmacist|other` (editable anytime — the *badge* is what's earned, not the label) · country (ISO select, optional) · institution (free text ≤120, optional) · bio (≤280, optional). Monograph-label form styling per STYLE; all writes via owner-RLS.

### 4.6 Settings IA
`/settings/profile` · `/settings/appearance` (theme system/light/dark + reader text size — persisted in `profiles.prefs jsonb {theme, text_size}` so S5/S7 follow the account across devices) · `/settings/ai-keys` (M3 owns internals) · `/settings/data` (export §4.9 · delete §4.7) · `/settings/sessions` (sign-in methods §4.3 · sign out everywhere §4.8).

### 4.7 Account deletion — the 14-day state machine (M2-2)
**Request:** Settings → Data → "Delete account" → consequence sheet (what purges, the 14-day window, that signing in cancels) → **re-authentication** (password, or fresh Google auth for OAuth-only) → confirm. Effects at T0: `profiles.deletion_requested_at = now()`, all sessions revoked, confirmation email with the purge date and a sign-in link that cancels.
**Grace (days 0–14):** the account is dormant — public traces (none in Phase 1; anonymized placeholders once community exists) and sign-in is the single restore path: **signing in auto-cancels deletion**, clears the flag, shows *"Deletion canceled — welcome back."*, and emails confirmation.
**Purge (day 14, cron `purge-deleted-accounts`):** ordered, idempotent, per Privacy Policy — (1) `ai_keys`, (2) study data (`highlights`, `user_notes`, `bookmarks`, `progress`, `last_visited`), (3) module-owned personal rows present at the time (resumes, saved jobs, verification docs), (4) `waitlist_signups` by email, (5) storage objects (avatar), (6) future public contributions → sentinel "deleted user", (7) `profiles` row + GoTrue user. A minimal `deletion_receipts(user_hash, purged_at)` row (no PII) proves execution. Backups age out on the standard 30-day cycle (Privacy §6).

### 4.8 Sign out everywhere (M2-3)
Settings → Sessions → one button → GoTrue global sign-out (all refresh tokens revoked, **including the current session**) → redirect to sign-in with *"You've been signed out on every device."* Honest and simple; per-device lists are explicitly out of v1.

### 4.9 Study-data export (M2-5)
Settings → Data → "Export my study data" → server action streams `epharmatica-export-YYYY-MM-DD.json` (rate limit 3/day):
```json
{ "exported_at": "...", "user": { "username": "...", "display_name": "...", "email": "..." },
  "highlights": [ { "path": "subject/chapter/topic/subtopic", "title": "...", "kind": "prose|table|drugcard|code|caption",
                    "color": "amber", "text": "snapshot", "orphaned": false, "created_at": "...",
                    "note": { "text": "...", "created_at": "..." } } ],
  "notes":     [ { "path": "...", "title": "...", "text": "...", "created_at": "..." } ],
  "bookmarks": [ { "type": "subtopic|topic", "path": "...", "title": "..." } ],
  "progress":  [ { "path": "...", "title": "...", "completed_at": "..." } ] }
```
Note bodies serialize Plate→plain text (marks flattened). Format is versioned implicitly by date; M5 will extend with community content when that exists.

### 4.10 Phase-2 visibility contract (M2-6)
`profiles.visibility enum('unset','public','private') default 'unset'` ships **now**. At Phase-2 launch, the first sign-in of any `unset` user triggers a one-time blocking modal — equal-weight **Make my profile public / Keep it private** buttons, a plain list of exactly what a public profile shows, no preselection, no dismissal without choosing. Post-Phase-2 signups choose during onboarding. `/u/{username}` for non-public profiles renders a neutral *"This profile is private."* card (same response signed-in or out — existence isn't hidden since usernames appear on future public content anyway). Changeable anytime in Settings once Phase 2 exists.

## 5. Transactional Email Set (via Resend/Brevo)
verify-email · password-reset · email-change (confirmation to the new address, notice to the old) · sign-in-method added/removed (§4.3) · deletion requested (with cancel link) · deletion canceled · admin force-rename notice. All plain, monograph-styled HTML + text part; no marketing content ever mixed in (Privacy §3).

## 6. Data-Model Deltas (vs master PRD §9)
- `profiles` **add**: `deletion_requested_at timestamptz null`, `visibility` enum default `'unset'`, `prefs jsonb default '{}'` (`theme`, `text_size`), `email_verified_at` mirror for query convenience.
- **add** `reserved_usernames(handle text pk)` (seeded §4.4) and `handle_quarantine(handle text pk, freed_after timestamptz)`.
- **add** `deletion_receipts(user_hash text, purged_at timestamptz)`.
- Identity linking uses GoTrue's `identities` — no custom tables.

## 7. RLS & Column Protection
`profiles`: owner select/update — but **privileged columns** (`role`, `is_verified_pharmacist`, `verified_at`, `deletion_requested_at` clearing) are guarded by a `BEFORE UPDATE` trigger rejecting non-service changes; role mutation only via `security definer` admin functions (audited). `reserved_usernames`/`handle_quarantine`: public select (availability checks), service-role write. CI RLS tests add: *user cannot self-elevate `role`*, *user cannot self-set `is_verified_pharmacist`*, *user A cannot read B's `prefs`/email*, *availability check works anonymously*.

## 8. Security & Abuse Controls
Re-auth required for: deletion, email change, sign-in-method removal. Rate limits (table-backed + Cloudflare): sign-up 5/hr/IP · sign-in 10/15min/IP with backoff · reset 3/hr/identifier · availability check 30/min/IP · export 3/day/user. Turnstile on sign-up, reset, and the waitlist form. Session cookies httpOnly/secure/SameSite=Lax; auth flows never leak account existence beyond what reset UX requires ("If that account exists, we've emailed a link"). All auth events append `audit_log` entries with hashed IP.

## 9. Edge Cases & Rules
Google-first user later adds a password via reset-flow on their (verified) address — allowed, then both methods exist. Auto-link attempt against an unverified local account (§4.3) never merges data. Username uniqueness race → DB unique constraint, friendly retry. A grace-period account's email cannot be reused for a fresh sign-up until purge (clear error pointing at sign-in-to-restore). Force-renamed users keep all data; only the handle changes. Avatar upload failures never destroy the previous avatar (write-then-swap). Deleting the account with an in-flight export simply lets the export be the last artifact.

## 10. Analytics Events (Umami — no PII)
`signup_started` (prop: method) · `signup_completed` (method) · `oauth_completion_shown` · `identity_linked` · `email_verified` · `signin` (method) · `signout_everywhere` · `export_downloaded` · `deletion_requested` · `deletion_canceled` · `deletion_purged` (cron-emitted count).

## 11. Acceptance Criteria (module gate)
1. Both sign-up paths land the user back at their pre-auth location; Google path cannot bypass the completion step.
2. Auto-link demonstrably refuses unverified local emails and links verified ones with notification email sent.
3. Username: availability live-checks, reserved list enforced, uniqueness race handled; force-rename flow works end-to-end with quarantine.
4. Deletion: request → revoked sessions → sign-in cancels → day-14 purge verified against a seeded account, purge order per §4.7, receipt row written, zero residual rows across all module tables and storage.
5. Export JSON validates against §4.9 for a fixture user incl. an orphaned highlight with note.
6. "Sign out everywhere" revokes a second live device within seconds (e2e with two contexts).
7. RLS/column-protection tests pass, incl. self-elevation attempts.
8. All eight transactional emails render (both parts) and send in staging.

## 12. Module Risks
- **R-M2a — auto-link takeover**: mitigated by the both-sides-verified rule (§4.3) + notification emails + CI test; residual risk accepted and documented.
- **R-M2b — purge correctness drift** as later modules add personal tables: mitigated by a `personal_data_registry` (each module registers its purge step; the cron iterates the registry, and CI fails if a table with `user_id` isn't registered).
- **R-M2c — immutable-username regret**: mitigated by signup copy + availability UX; support burden monitored, policy revisit flagged only if rename requests exceed ~1% of accounts.

## 13. Open Items
Verification application flow + public profile rendering → M5 (fields contracted here). AI-key settings internals → M3. Admin surfaces for force-rename, deletion oversight, and the personal-data registry → M4.

*End Module PRD 02 · decisions M2-1…M2-6 locked · next: M3 AI Study Suite.*
