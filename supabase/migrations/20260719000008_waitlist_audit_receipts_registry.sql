-- 008 · waitlist_signups + audit_log + deletion_receipts + personal_data_registry
-- (master PRD §7.1/§9 · S12 · M2 §4.7/§6/R-M2b · securities.md §3/§11 · rules.md §12.3)

-- ---------------------------------------------------------------------------
-- waitlist_signups — landing waitlist (S12: email + module + role)
-- ---------------------------------------------------------------------------
-- Module/role sets mirror @epharmatica/database WAITLIST_MODULES /
-- WAITLIST_ROLES exactly — change both together or not at all.
create table public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  module text not null,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_signups_module_known check (
    module in ('learning', 'ai-study-tools', 'community', 'blog', 'jobs', 'resume-builder')
  ),
  constraint waitlist_signups_role_known check (
    role in ('student', 'professional', 'other')
  ),
  constraint waitlist_signups_unique_per_module unique (email, module)
);

create trigger waitlist_signups_set_updated_at
  before update on public.waitlist_signups
  for each row execute function public.set_updated_at();

alter table public.waitlist_signups enable row level security;

-- Anon INSERT only — no reads. Rows are read solely by staff via the service
-- role; the M2 purge (step 4) deletes by email the same way. select is
-- revoked outright so INSERT … RETURNING can never echo rows either (the
-- landing form inserts with Prefer: return=minimal).
revoke select, update, delete on table public.waitlist_signups from anon, authenticated;

create policy waitlist_signups_public_insert on public.waitlist_signups
  for insert to anon, authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- audit_log — append-only, hardened (I8 · rules.md §12.3 · securities.md §3)
-- ---------------------------------------------------------------------------
-- entity_id is text (not uuid): audited entities include natural-key rows
-- such as feature_flags.key.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  -- Hashed IP only (securities.md §13) — never raw.
  ip_hash text,
  created_at timestamptz not null default now(),
  -- Present for the repo-wide created_at/updated_at rule; frozen forever —
  -- UPDATE is revoked from every API role below.
  updated_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Append-only hardening: no update/delete grants to ANY role — including
-- service_role. The 12-month hot-window prune (yearly R2 export cron) runs on
-- a direct owner connection, outside the API surface. CI probes this.
revoke update, delete on table public.audit_log from public;
revoke update, delete on table public.audit_log from anon, authenticated, service_role;

-- Admin+ read the audit surface (M4). Inserts happen via withAudit() on the
-- service role (which has insert privilege and bypasses RLS) — no insert
-- policy for API roles, and no update/delete policies exist at all.
create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (public.has_role(array['admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- deletion_receipts — proof of purge, zero PII (M2 §4.7)
-- ---------------------------------------------------------------------------
-- user_hash is a keyed hash of the purged user id — never the id, email, or
-- username. Written by the purge-deleted-accounts cron (service role).
create table public.deletion_receipts (
  id uuid primary key default gen_random_uuid(),
  user_hash text not null,
  purged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- Frozen — receipts are immutable (see audit_log.updated_at note).
  updated_at timestamptz not null default now()
);

alter table public.deletion_receipts enable row level security;

-- Immutable + invisible to API roles: no policies; update/delete revoked
-- everywhere (inserts come from the service-role cron only).
revoke all on table public.deletion_receipts from anon, authenticated;
revoke update, delete on table public.deletion_receipts from public;
revoke update, delete on table public.deletion_receipts from service_role;

-- ---------------------------------------------------------------------------
-- personal_data_registry — the purge map (M2 R-M2b · rules.md §5.4)
-- ---------------------------------------------------------------------------
-- Every table containing user_id MUST register its purge step here; CI fails
-- otherwise. The purge cron iterates this registry in step order (M2 §4.7):
--   1 ai_keys · 2 study data · 3 module personal rows · 4 waitlist by email
--   5 storage objects · 6 public contributions → sentinel · 7 profiles+GoTrue
create table public.personal_data_registry (
  table_name text primary key,
  module text not null,
  purge_step int not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_data_registry_step_range check (purge_step between 1 and 7)
);

create trigger personal_data_registry_set_updated_at
  before update on public.personal_data_registry
  for each row execute function public.set_updated_at();

insert into public.personal_data_registry (table_name, module, purge_step, notes) values
  ('ai_keys',          'm3-ai',       1, 'Purged first per Privacy Policy; sealed-box blobs deleted.'),
  ('ai_rate_limits',   'm3-ai',       1, 'Per-user counters; purged with the AI surface.'),
  ('highlights',       'm1-learning', 2, 'Study data.'),
  ('user_notes',       'm1-learning', 2, 'Study data; includes AI-provenance notes.'),
  ('bookmarks',        'm1-learning', 2, 'Study data.'),
  ('progress',         'm1-learning', 2, 'Study data.'),
  ('last_visited',     'm1-learning', 2, 'Study data (single row per user).'),
  ('waitlist_signups', 'foundation',  4, 'Keyed by email, not user_id — deleted by the account''s email.'),
  ('profiles',         'm2-accounts', 7, 'Deleted last, together with the GoTrue user.');

alter table public.personal_data_registry enable row level security;

-- Registry viewer is an admin surface (M4 Settings); writes ride migrations
-- (each module registers its tables) or the service role — no write policies.
create policy personal_data_registry_admin_read on public.personal_data_registry
  for select to authenticated
  using (public.has_role(array['admin', 'super_admin']));
