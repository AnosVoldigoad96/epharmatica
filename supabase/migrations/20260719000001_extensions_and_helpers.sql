-- 001 · Extensions + security-definer helpers
-- ePharmatica foundation (master PRD Appendix C · development-plan.md 0.D · securities.md §4).
-- Forward-only (invariant I7). Rollback = a new forward migration.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- gen_random_uuid() is built into Postgres 13+; pgcrypto is still required for
-- crypt()/gen_salt() (seed + tests) and future hashing needs.
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
-- Every table carries created_at/updated_at (rules.md §5.1). Each migration
-- attaches this trigger to its tables. Append-only tables (audit_log,
-- deletion_receipts) skip the trigger — their rows can never change.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger body maintaining updated_at on every mutable table.';

-- ---------------------------------------------------------------------------
-- has_role(text[]) — the RLS role gate (securities.md §4 archetype b)
-- ---------------------------------------------------------------------------
-- Reads profiles.role for auth.uid(). SECURITY DEFINER so RLS on profiles
-- (owner-only select) does not block policy evaluation for other tables.
-- plpgsql (not sql) so the body is not resolved at creation time — profiles
-- is created in migration 002.
create or replace function public.has_role(required_roles text[])
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return false;
  end if;

  select p.role::text
    into v_role
    from public.profiles p
   where p.id = auth.uid();

  return v_role = any (required_roles);
end;
$$;

comment on function public.has_role(text[]) is
  'True when the current auth.uid() has one of the given application roles (profiles.role). Security definer; used by RLS policies.';

-- ---------------------------------------------------------------------------
-- can_feature(text) — feature-flag gate
-- ---------------------------------------------------------------------------
-- Returns feature_flags.enabled for a key (false when the flag is absent).
-- The server-side entitlement gate can(user, feature) lives in
-- apps/web/lib/entitlements; this SQL helper exists for RLS policies that
-- must honor a flag (e.g. employer_submissions in Phase 3).
create or replace function public.can_feature(feature_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
begin
  select f.enabled
    into v_enabled
    from public.feature_flags f
   where f.key = feature_key;

  return coalesce(v_enabled, false);
end;
$$;

comment on function public.can_feature(text) is
  'True when feature_flags.enabled is true for the key; false when absent. Security definer; used by flag-gated RLS policies.';

-- ---------------------------------------------------------------------------
-- Phase-2 helpers — NOT created here
-- ---------------------------------------------------------------------------
-- is_sanctioned(uuid) and has_verified_email() ship with the Phase-2
-- community migrations (M5 / securities.md §4 archetype c). They are noted
-- here so the helper roster in migration 001 stays the single reference
-- point: 001 owns has_role() + can_feature(); Phase 2 adds the rest.
