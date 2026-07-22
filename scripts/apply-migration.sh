#!/usr/bin/env bash
#
# apply-migration.sh — safely apply ONE forward-only migration to the
# self-hosted Supabase Postgres on the box (docs/runbooks/auth-deploy.md §1).
#
# It is deliberately run BY A HUMAN on the box (or by CI through the existing
# forced-command deploy key) — never by an external agent over SSH. What it
# does, in order:
#   1. preflight: connect to the DB container, verify credentials
#   2. ledger guard: if a supabase_migrations ledger exists and already has
#      this version, stop (idempotent)
#   3. automatic pre-migration dump (pg_dump -Fc) to /root — the apply never
#      runs without a fresh backup (rules.md I7 / PRD §13.4)
#   4. apply the file in a SINGLE transaction (ON_ERROR_STOP): any failure
#      rolls the whole thing back, DB unchanged
#   5. record the version in the ledger if one is present
#
# Usage:  ./apply-migration.sh <path-to-migration.sql>
# Example: ./apply-migration.sh supabase/migrations/20260720000011_auth_rate_limits_reserved_handles.sql
#
# Note: migrations must be transaction-safe (no CREATE INDEX CONCURRENTLY,
# no CREATE DATABASE). All in-repo migrations satisfy this.

set -euo pipefail

MIG="${1:?usage: apply-migration.sh <path-to-migration.sql>}"
[ -f "$MIG" ] || { echo "no such file: $MIG" >&2; exit 1; }

# Where the self-hosted Supabase compose + .env live, and the DB container name.
# Override via env if your paths differ.
SUPADIR="${SUPADIR:-/opt/epharmatica-supabase/supabase-upstream/docker}"
DBC="${DBC:-supabase-db}"

[ -f "$SUPADIR/.env" ] || { echo "no .env at $SUPADIR — set SUPADIR" >&2; exit 1; }
PGPW="$(grep '^POSTGRES_PASSWORD=' "$SUPADIR/.env" | cut -d= -f2-)"

db() { docker exec -i -e PGPASSWORD="$PGPW" "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

ver="$(basename "$MIG" | sed 's/_.*//')"        # leading numeric version
name="$(basename "$MIG" .sql | sed 's/^[0-9]*_//')"

echo "== migration $ver ($name) =="

# 1. preflight
db -tAc "select 1" >/dev/null \
  || { echo "cannot reach $DBC as postgres — check POSTGRES_PASSWORD / container name (DBC=$DBC)" >&2; exit 1; }

# 2. ledger guard (only if a ledger exists)
if [ -n "$(db -tAc "select to_regclass('supabase_migrations.schema_migrations')")" ]; then
  if [ -n "$(db -tAc "select 1 from supabase_migrations.schema_migrations where version='$ver'")" ]; then
    echo "version $ver already recorded in the ledger — nothing to do."
    exit 0
  fi
fi

# 3. pre-migration dump
ts="$(date +%Y%m%d-%H%M%S)"
dump="/root/premig-${ver}-${ts}.dump"
echo "== pre-migration dump -> $dump =="
docker exec -e PGPASSWORD="$PGPW" "$DBC" pg_dump -U postgres -Fc -d postgres > "$dump"
ls -lh "$dump"

# 4. apply, single transaction
echo "== applying (single transaction) =="
db -1 < "$MIG"
echo "APPLIED OK"

# 5. record in the ledger if present
if [ -n "$(db -tAc "select to_regclass('supabase_migrations.schema_migrations')")" ]; then
  db -c "insert into supabase_migrations.schema_migrations (version, name)
         values ('$ver', '$name') on conflict (version) do nothing;" \
    && echo "ledger recorded ($ver)" \
    || echo "ledger insert skipped (schema mismatch — record manually if you use the CLI)"
fi

echo "== done: $ver applied. backup at $dump =="
