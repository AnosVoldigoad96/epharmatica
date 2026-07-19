-- 005 · content_revisions + content_review_events + slug_history
-- (master PRD §7.2.3/§9 · M1 §6 slug_history delta · rules.md §5.7)
--
-- Revisions are immutable snapshots: publishing snapshots first, rollback
-- restores by creating a NEW revision — never destructive. No update/delete
-- policies exist on either revisions or review events.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.content_level as enum ('subject', 'chapter', 'topic', 'subtopic');

-- ---------------------------------------------------------------------------
-- content_revisions — snapshot on submit and on publish
-- ---------------------------------------------------------------------------
create table public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  content jsonb not null,
  editor_id uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  -- Present for the repo-wide created_at/updated_at rule; revisions are
  -- immutable so this never advances (no update policy, no trigger).
  updated_at timestamptz not null default now(),
  constraint content_revisions_content_is_array
    check (jsonb_typeof(content) = 'array')
);

create index content_revisions_subtopic_id_idx
  on public.content_revisions (subtopic_id, created_at desc);

-- ---------------------------------------------------------------------------
-- content_review_events — every workflow transition (M4 contract)
-- ---------------------------------------------------------------------------
create table public.content_review_events (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  from_status public.content_status,
  to_status public.content_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  comment text,
  created_at timestamptz not null default now(),
  -- Immutable event row — see content_revisions.updated_at note.
  updated_at timestamptz not null default now()
);

create index content_review_events_subtopic_id_idx
  on public.content_review_events (subtopic_id, created_at desc);

-- ---------------------------------------------------------------------------
-- slug_history — renames at EVERY level of the tree (M1 §6 delta)
-- ---------------------------------------------------------------------------
-- parent_path is a snapshot of the parent segments at rename time (e.g.
-- 'pharmacology/autonomic-nervous-system/cholinergic-agonists' for a subtopic)
-- so 301s can be built without re-walking a tree that may have changed since.
create table public.slug_history (
  id uuid primary key default gen_random_uuid(),
  level public.content_level not null,
  entity_id uuid not null,
  parent_path text not null,
  old_slug text not null,
  new_slug text not null,
  created_at timestamptz not null default now(),
  -- Immutable history row — see content_revisions.updated_at note.
  updated_at timestamptz not null default now()
);

create index slug_history_lookup_idx
  on public.slug_history (level, old_slug);
create index slug_history_entity_idx
  on public.slug_history (entity_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.content_revisions enable row level security;
alter table public.content_review_events enable row level security;
alter table public.slug_history enable row level security;

-- Revisions: content staff read (authors view their revision history,
-- reviewers diff); snapshot inserts come from the submit/publish pipeline.
-- No update/delete policies — immutable (rules.md §5.7).
create policy content_revisions_staff_read on public.content_revisions
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy content_revisions_staff_insert on public.content_revisions
  for insert to authenticated
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

-- Review events: staff read; transitions append events (authors submit,
-- reviewers approve/request changes, managers publish). No update/delete.
create policy content_review_events_staff_read on public.content_review_events
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy content_review_events_staff_insert on public.content_review_events
  for insert to authenticated
  with check (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

-- slug_history: public read — 301 resolution runs in the anon-key server
-- client for every level of the tree. Writes: rename/move flows only
-- (content managers via CMS or the service-role Move… pipeline). No
-- update/delete — history is append-only.
create policy slug_history_public_read on public.slug_history
  for select to anon, authenticated
  using (true);

create policy slug_history_staff_insert on public.slug_history
  for insert to authenticated
  with check (public.has_role(array['content_manager', 'admin', 'super_admin']));
