-- 003 · plans / entitlements / feature_flags (master PRD §7.11, D3 — dormant)
--
-- The monetization-flexibility layer: dormant at launch, wired from day one.
-- Every premium-candidate surface calls can(user, feature) server-side
-- (apps/web/lib/entitlements, invariant I5); these tables are its substrate.
-- Feature flags are DB-backed, cached behind the `flags` tag; flips are
-- audited (M4) and bust that tag.

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- At launch every user maps to the implicit 'free' plan where everything
-- current is allowed (master §7.11). No per-user plan assignment table yet —
-- that lands when monetization activates.
insert into public.plans (key, name, description, is_default)
values ('free', 'Free', 'Implicit launch plan — every current feature allowed.', true);

-- ---------------------------------------------------------------------------
-- entitlements — per-plan feature grants (dormant)
-- ---------------------------------------------------------------------------
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature text not null,
  value jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entitlements_plan_feature_unique unique (plan_id, feature)
);

create trigger entitlements_set_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- feature_flags
-- ---------------------------------------------------------------------------
create table public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  value jsonb,
  description text,
  phase_tag text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- Seed states (development-plan.md §12 flag inventory):
-- coming_soon.* drives the landing's Coming Soon ribbons. Learning and the
-- AI study tools ship in Phase 1, so their ribbons are off; everything later
-- shows the ribbon until its phase lands.
insert into public.feature_flags (key, enabled, value, description, phase_tag) values
  ('coming_soon.learning',       false, null,
   'Coming Soon ribbon for the Learning module. Off — ships in Phase 1.', 'phase-1'),
  ('coming_soon.ai_study_tools', false, null,
   'Coming Soon ribbon for the AI study tools (BYOK). Off — ships in Phase 1.', 'phase-1'),
  ('coming_soon.community',      true,  null,
   'Coming Soon ribbon for Community (forum + profiles).', 'phase-2'),
  ('coming_soon.blog',           true,  null,
   'Coming Soon ribbon for the Blog.', 'phase-2'),
  ('coming_soon.jobs',           true,  null,
   'Coming Soon ribbon for the Jobs portal.', 'phase-3'),
  ('coming_soon.resume',         true,  null,
   'Coming Soon ribbon for the Resume builder.', 'phase-3'),
  ('coming_soon.whatsapp',       true,  null,
   'Coming Soon ribbon for the WhatsApp content bot.', 'phase-4'),
  ('employer_submissions',       false, null,
   'Employer submission form + job_submissions reachable only while on (M6-2). Form 404s while off.', 'phase-3'),
  ('wa_bot_enabled',             false, null,
   'WhatsApp bot kill-switch — flips within one revalidation (M8).', 'phase-4'),
  ('highlight_kinds',            true,  '"all"'::jsonb,
   'Which anchor kinds may be created. "all" or a restricted list (e.g. ["prose"]) — the M1 R-M1 production fallback, no schema change needed.', 'phase-1'),
  ('anon_questions',             true,  null,
   'Anonymous Question threads permitted (M5-4 policy kill-switch). Enabled as the policy default for Phase 2.', 'phase-2');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.entitlements enable row level security;
alter table public.feature_flags enable row level security;

-- plans/entitlements: readable by signed-in sessions (the server-side can()
-- gate evaluates with the user client); writes are service-role only until a
-- monetization admin surface exists — no write policies.
create policy plans_authenticated_read on public.plans
  for select to authenticated
  using (true);

create policy entitlements_authenticated_read on public.entitlements
  for select to authenticated
  using (true);

-- feature_flags: public read — the landing (anon, ISR) renders Coming Soon
-- states from these rows. Writes: admin+ via the M4 Settings editor
-- (flips audited via withAudit, bust the `flags` tag).
create policy feature_flags_public_read on public.feature_flags
  for select to anon, authenticated
  using (true);

create policy feature_flags_admin_write on public.feature_flags
  for all to authenticated
  using (public.has_role(array['admin', 'super_admin']))
  with check (public.has_role(array['admin', 'super_admin']));
