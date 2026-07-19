# supabase/ — database foundation

Forward-only migrations, RLS probe suite, and local-dev seed for ePharmatica
(master PRD Appendix C · development-plan.md 0.D · rules.md §5 · securities.md
§4–§8). Repo-level, **not** a workspace package — the CLI operates on this
directory directly.

## Layout

```
supabase/
├── config.toml            CLI config (project_id "epharmatica")
├── migrations/            001–010, forward-only (I7)
├── tests/                 SQL RLS probe suite + tests/README.md
└── seed/seed.sql          local-dev seed (one user per role + demo content)
```

## Migration roster (Appendix C order)

| #   | File                                         | Contents                                                                                                                                                                                                                              |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | `…_extensions_and_helpers.sql`               | pgcrypto, pg_trgm, citext · `set_updated_at()` · `has_role(text[])` · `can_feature(text)`. `is_sanctioned()`/`has_verified_email()` ship in Phase 2 (noted, not created)                                                              |
| 002 | `…_profiles.sql`                             | `profiles` (+ updated_at + privileged-column guard trigger; **no auth.users auto-create trigger** — app creates rows on signup/OAuth completion) · `reserved_usernames` (M2 seed list) · `handle_quarantine` · `username_available()` |
| 003 | `…_plans_entitlements_feature_flags.sql`     | `plans` (`free` default) · `entitlements` · `feature_flags` (seeded Coming-Soon + module flags)                                                                                                                                       |
| 004 | `…_content_tree.sql`                         | `subjects → chapters → topics → subtopics` (M1 deltas: `topics.description varchar(280)`, `subtopics.primary_video_url`, `preview_block_count`, no short/long video URLs)                                                             |
| 005 | `…_revisions_review_events_slug_history.sql` | `content_revisions` · `content_review_events` · `slug_history` (level + parent_path)                                                                                                                                                  |
| 006 | `…_study_data.sql`                           | `highlights` (anchor v:1, snapshot ≤1000) · `bookmarks` · `user_notes` · `progress` · `last_visited`                                                                                                                                  |
| 007 | `…_ai_keys_rate_limits_models.sql`           | `ai_keys` (RPC-only, grants revoked) · `ai_rate_limits` · `ai_models`                                                                                                                                                                 |
| 008 | `…_waitlist_audit_receipts_registry.sql`     | `waitlist_signups` (anon-insert-only) · `audit_log` (append-only) · `deletion_receipts` · `personal_data_registry`                                                                                                                    |
| 009 | `…_fts.sql`                                  | `subtopics.search_vector` generated column (A/B/C weights) + GIN + trigram indexes                                                                                                                                                    |
| 010 | `…_storage_buckets.sql`                      | buckets `content-media`/`avatars`/`covers` (public), `verification-docs` (private) + `storage.objects` policies                                                                                                                       |

## Run locally

Prerequisites: [Supabase CLI](https://supabase.com/docs/guides/cli) and Docker.

```bash
# from the repo root
supabase start          # boot the local stack (Postgres, GoTrue, Storage, Studio…)
supabase db reset       # apply migrations 001–010, then run seed/seed.sql
```

Local endpoints (defaults): API `http://127.0.0.1:54321` · DB
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` · Studio
`http://127.0.0.1:54323` · Inbucket (email) `http://127.0.0.1:54324`.

Demo accounts (all password `password123`): `user@epharmatica.test`,
`author@…`, `reviewer@…`, `content-manager@…`, `blog-editor@…`,
`moderator@…`, `jobs-manager@…`, `support@…`, `admin@…`,
`super-admin@epharmatica.test` — one per `app_role`.

## RLS probes

```bash
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
for f in supabase/tests/*.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f" || { echo "FAILED: $f"; exit 1; }
done
```

Details, PowerShell variant, and the coverage table live in
[`tests/README.md`](./tests/README.md). These are the Foundation/M2 members of
the securities.md §5 catalog and run in CI against a migrated shadow DB.

## Regenerate types after any migration (I7 drift check)

```bash
pnpm --filter @epharmatica/database gen:types
```

This wraps `supabase gen types typescript --local` → `packages/database/src/types.ts`.
CI fails if the committed types drift from the migrations, so regenerate and
commit in the same PR as the migration (rules.md §5.2, §9.2).

## Rules that bind this directory

- **Forward-only** (I7). Never edit a shipped migration; add a new one. Rollback
  = a new forward migration.
- **Every table**: uuid/natural PK, `created_at`/`updated_at`, RLS enabled,
  deny-by-default with explicit policies fitting one of the three archetypes
  (securities.md §4).
- **Any table with `user_id`** registers a purge step in
  `personal_data_registry` — CI fails otherwise (M2 R-M2b).
- Migrations, regenerated types, and RLS probes ship in the **same PR**
  (rules.md §5.2).
