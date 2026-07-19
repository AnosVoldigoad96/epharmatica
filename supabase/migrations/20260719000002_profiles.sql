-- 002 · profiles + reserved_usernames + handle_quarantine + RLS
-- (master PRD §9/§12 · M2 §4.4/§6/§7 · securities.md §4/§5)
--
-- NO auto-create trigger on auth.users — deliberate M2 decision:
-- profile rows are created by the app only on signup completion (email path)
-- or on the mandatory OAuth completion step (username + user type + 13+
-- checkbox). A Google user who abandons the completion step has an auth.users
-- row but NO profile row — that is the resumable "pending" state (M2 §4.2).
-- Do not add a trigger here in a later migration without a PRD change.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'user',
  'author',
  'reviewer',
  'content_manager',
  'blog_editor',
  'moderator',
  'jobs_manager',
  'support',
  'admin',
  'super_admin'
);

create type public.user_type as enum ('student', 'pharmacist', 'other');

create type public.profile_visibility as enum ('unset', 'public', 'private');

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- M2-1: immutable, lowercase-canonical, 3–20 chars, a–z 0–9 _ -,
  -- starts/ends alphanumeric. Uniqueness is case-insensitive by construction
  -- (only lowercase passes the format check).
  username text not null,
  display_name text not null,
  avatar_url text,
  user_type public.user_type not null default 'student',
  country text,
  institution text,
  bio text,
  role public.app_role not null default 'user',
  is_verified_pharmacist boolean not null default false,
  verified_at timestamptz,
  -- M2-6: ships now, default 'unset'; the one-time choice prompt activates at
  -- Phase-2 launch.
  visibility public.profile_visibility not null default 'unset',
  -- M2 §4.6: {theme, text_size} read by reader surfaces.
  prefs jsonb not null default '{}'::jsonb,
  -- Mirror of GoTrue confirmation for query convenience (M2 §6);
  -- service-maintained.
  email_verified_at timestamptz,
  -- M2-2: T0 of the 14-day deletion state machine.
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$'),
  constraint profiles_username_unique unique (username),
  constraint profiles_display_name_length
    check (char_length(display_name) between 2 and 50),
  constraint profiles_institution_length
    check (institution is null or char_length(institution) <= 120),
  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 280),
  constraint profiles_prefs_is_object
    check (jsonb_typeof(prefs) = 'object')
);

comment on table public.profiles is
  '1:1 with auth.users. Created by the app on signup/OAuth completion only — no auth.users trigger (M2 decision).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileged-column guard (M2 §7 · securities.md §4 "trigger-guarded columns")
-- ---------------------------------------------------------------------------
-- Rejects changes by the API roles (anon/authenticated) to: role,
-- is_verified_pharmacist, verified_at, clearing deletion_requested_at,
-- username (immutable, M2-1 — admin force-rename runs as service role), and
-- email_verified_at (service-maintained mirror). Service role, cron, and
-- audited security-definer admin functions are unaffected.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.role is distinct from old.role
       or new.is_verified_pharmacist is distinct from old.is_verified_pharmacist
       or new.verified_at is distinct from old.verified_at
       or new.username is distinct from old.username
       or new.email_verified_at is distinct from old.email_verified_at
       or (old.deletion_requested_at is not null and new.deletion_requested_at is null)
    then
      raise exception
        'profiles: privileged columns (role, is_verified_pharmacist, verified_at, username, email_verified_at, deletion_requested_at clearing) can only be changed by service roles'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_privileged_columns_guard
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- ---------------------------------------------------------------------------
-- reserved_usernames — routes + brand (M2 §4.4, exact seed list) — growable
-- ---------------------------------------------------------------------------
create table public.reserved_usernames (
  handle text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger reserved_usernames_set_updated_at
  before update on public.reserved_usernames
  for each row execute function public.set_updated_at();

insert into public.reserved_usernames (handle) values
  ('admin'), ('api'), ('app'), ('auth'), ('blog'), ('community'), ('dev'),
  ('epharmatica'), ('help'), ('jobs'), ('learn'), ('legal'), ('resume'),
  ('search'), ('settings'), ('support'), ('system'), ('u'), ('verify'),
  ('whatsapp');

-- ---------------------------------------------------------------------------
-- handle_quarantine — 90-day hold after admin force-rename (M2 §4.4)
-- ---------------------------------------------------------------------------
create table public.handle_quarantine (
  handle text primary key,
  freed_after timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger handle_quarantine_set_updated_at
  before update on public.handle_quarantine
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- username_available(text) — anonymous availability check (M2 §7 CI probe)
-- ---------------------------------------------------------------------------
-- Security definer so the check can see profiles despite owner-only RLS.
-- Returns false for bad format, reserved handles, quarantined handles, and
-- taken usernames. Rate limiting (30/min/IP) is app-level.
create or replace function public.username_available(candidate text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := lower(trim(candidate));
begin
  if v !~ '^[a-z0-9][a-z0-9_-]{1,18}[a-z0-9]$' then
    return false;
  end if;
  if exists (select 1 from public.reserved_usernames r where r.handle = v) then
    return false;
  end if;
  if exists (select 1 from public.handle_quarantine q
              where q.handle = v and q.freed_after > now()) then
    return false;
  end if;
  if exists (select 1 from public.profiles p where p.username = v) then
    return false;
  end if;
  return true;
end;
$$;

comment on function public.username_available(text) is
  'Anonymous username availability check: format + reserved + quarantine + uniqueness.';

-- ---------------------------------------------------------------------------
-- RLS — deny by default (I1)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.reserved_usernames enable row level security;
alter table public.handle_quarantine enable row level security;

-- profiles: owner select/update; owner insert (the app creates the row with
-- the user's own session on signup/OAuth completion — id must equal
-- auth.uid()). No delete policy — purge runs as service role (M2 §4.7).
-- Public profile reads arrive with Phase 2 via the visibility contract.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- reserved_usernames / handle_quarantine: public select for availability
-- checks (M2 §7); writes are service-role / migration only (no policies).
create policy reserved_usernames_public_read on public.reserved_usernames
  for select to anon, authenticated
  using (true);

create policy handle_quarantine_public_read on public.handle_quarantine
  for select to anon, authenticated
  using (true);
