# RLS probe suite

SQL security probes for the Phase-0 foundation (securities.md §5, "Foundation / M2"
catalog). Each probe raises an exception on violation; with `ON_ERROR_STOP` psql
exits nonzero, so the suite is CI-ready as-is.

## What is covered

| File                                 | Asserts                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00_setup.sql`                       | Fixtures: users A/B/admin (auth.users + profiles), published + draft subtopics, study rows for both users, an `ai_keys` row, an audit row                   |
| `01_content_visibility.sql`          | Anon cannot select draft subtopics; anon CAN select published; non-staff authenticated cannot see drafts                                                    |
| `02_study_owner_isolation.sql`       | User A cannot read user B's highlights/notes/bookmarks/progress/last_visited/profile (prefs, email); cross-user insert rejected; positive controls included |
| `03_ai_keys_lockdown.sql`            | `authenticated` (even the owner) and `anon` get **permission denied** on `ai_keys` and `ai_rate_limits` (RPC-only tables)                                   |
| `04_profiles_privileged_columns.sql` | Owner can edit ordinary fields but cannot change `role`, `is_verified_pharmacist`, `username`, or clear `deletion_requested_at` (BEFORE UPDATE guard)       |
| `05_audit_log_append_only.sql`       | `audit_log` update/delete denied for `authenticated` **and** `service_role`; admin read works; probe row survives                                           |
| `06_waitlist.sql`                    | Anon INSERT works; anon/authenticated SELECT and anon DELETE are denied                                                                                     |

## How the probes simulate API roles

Each probe is a `DO` block executed as `postgres`. Inside it:

1. `set_config('request.jwt.claims', '{"sub":"…","role":"…"}', true)` — scoped
   to the statement's transaction; `auth.uid()` reads the `sub` claim.
2. `SET LOCAL ROLE anon|authenticated|service_role` — RLS and table grants
   then apply exactly as they do through PostgREST.
3. Queries + assertions; `RESET ROLE` before any postgres-level verification.

Because `SET LOCAL` is transaction-scoped and every `DO` statement is its own
transaction, probes cannot leak role state into each other.

## Running

Prerequisite: `supabase start` + `supabase db reset` have run from the repo
root (migrations applied, see `supabase/README.md`). Default local DB URL:

```
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Bash:

```bash
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/00_setup.sql \
  -f supabase/tests/01_content_visibility.sql \
  -f supabase/tests/02_study_owner_isolation.sql \
  -f supabase/tests/03_ai_keys_lockdown.sql \
  -f supabase/tests/04_profiles_privileged_columns.sql \
  -f supabase/tests/05_audit_log_append_only.sql \
  -f supabase/tests/06_waitlist.sql
```

PowerShell:

```powershell
$db = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
Get-ChildItem supabase/tests -Filter *.sql | Sort-Object Name | ForEach-Object {
  psql $db -v ON_ERROR_STOP=1 -f $_.FullName
  if ($LASTEXITCODE -ne 0) { throw "RLS probe failed: $($_.Name)" }
}
```

Exit code `0` + a `… PROBES PASSED` line per file = green. Any violation
raises `FAIL nn.n: …` and aborts the run.

`00_setup.sql` is idempotent — rerun the suite freely. Fixtures use fixed
UUIDs in the `00000000-…`/`f0000000-…` ranges and never collide with seed
data (`supabase/seed/seed.sql` uses the `10000000-…`/`11111111-…` ranges).

## Adding probes

One concern per file, numbered to sort after `06_`. Follow the DO-block
pattern above, always include a positive control (an empty table must not
fake a pass), and register the probe in the securities.md §5 catalog in the
same PR (rules.md §9.5).
