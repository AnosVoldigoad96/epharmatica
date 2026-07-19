-- 004 · Content tree: subjects → chapters → topics → subtopics
-- (master PRD §9 · M1 §4–§6 deltas · ARCHITECTURE §4.2 · securities.md §4 archetype b)
--
-- M1 deltas honored here:
--   * topics.description varchar(280) (M1 §6)
--   * subtopics.primary_video_url (derived at publish from the first video
--     block — M1-2); NO short_video_url / long_video_url columns (dropped)
--   * subtopics.preview_block_count int null (null = default preview rule)
-- Visibility cascade (M1-6) is ONE recursive read-query rule (≥1 published
-- descendant) enforced in features/content/queries.ts — parents carry NO
-- status flags. Only subtopics have a workflow status.
-- The preview gate is NOT an RLS concern (I3): anon may select published
-- subtopics; truncation to preview_block_count happens in the data layer.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.content_status as enum (
  'draft',
  'in_review',
  'changes_requested',
  'approved',
  'published',
  'archived'
);

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------
-- Note: the PRD field name `order` is a reserved SQL word; the column is
-- `sort_order` across the tree (same semantics).
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  default_semester int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_default_semester_range
    check (default_semester is null or default_semester between 1 and 10),
  constraint subjects_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- chapters
-- ---------------------------------------------------------------------------
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chapters_slug_per_parent unique (subject_id, slug),
  constraint chapters_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index chapters_subject_id_idx on public.chapters (subject_id);

create trigger chapters_set_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  name text not null,
  slug text not null,
  -- M1 §5.1: author-written plain-text paragraph, ≤280 chars.
  description varchar(280),
  -- HEC semester tag (D4): nullable, 1–10, inheritable from
  -- subjects.default_semester at the query layer.
  semester int,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_slug_per_parent unique (chapter_id, slug),
  constraint topics_semester_range
    check (semester is null or semester between 1 and 10),
  constraint topics_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index topics_chapter_id_idx on public.topics (chapter_id);

create trigger topics_set_updated_at
  before update on public.topics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- subtopics — the atomic learning unit (owns one Plate JSON document, I9)
-- ---------------------------------------------------------------------------
create table public.subtopics (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete cascade,
  title text not null,
  slug text not null,
  -- Plate JSON (array of blocks) — the single rich-text serialization (I9).
  content jsonb not null default '[]'::jsonb,
  -- plain_text / headings_text are refreshed on every save by the app
  -- (@epharmatica/editor block-walk serializers — the same code that powers
  -- getTextRuns), then migration 009's generated search_vector derives from
  -- them. Weighted A(title) / B(headings_text) / C(plain_text).
  plain_text text not null default '',
  headings_text text not null default '',
  -- M1 §5.4: null = default preview rule (blocks up to the first heading
  -- after index 0, capped at 5); author override min 1 (0 disallowed).
  preview_block_count int,
  -- M1-2: derived at publish from the first video-embed block; consumed by
  -- the WhatsApp bot, topic-overview cells, and OG cards. Null = no video.
  primary_video_url text,
  -- ceil(words/200), min 1 — computed at publish.
  reading_minutes int not null default 1,
  sort_order int not null default 0,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subtopics_slug_per_parent unique (topic_id, slug),
  constraint subtopics_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint subtopics_content_is_array check (jsonb_typeof(content) = 'array'),
  constraint subtopics_preview_block_count_min
    check (preview_block_count is null or preview_block_count >= 1),
  constraint subtopics_reading_minutes_min check (reading_minutes >= 1)
);

create index subtopics_topic_id_idx on public.subtopics (topic_id);
create index subtopics_status_idx on public.subtopics (status);

create trigger subtopics_set_updated_at
  before update on public.subtopics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — archetype (b): public-read-published + staff-write (securities.md §4)
-- ---------------------------------------------------------------------------
alter table public.subjects enable row level security;
alter table public.chapters enable row level security;
alter table public.topics enable row level security;
alter table public.subtopics enable row level security;

-- Parents carry no status: RLS guards row-level access only; the ≥1-published-
-- descendant visibility cascade is a query-layer rule (M1 §7).
create policy subjects_public_read on public.subjects
  for select to anon, authenticated using (true);

create policy chapters_public_read on public.chapters
  for select to anon, authenticated using (true);

create policy topics_public_read on public.topics
  for select to anon, authenticated using (true);

-- Subtopics: anon/authenticated read published rows only. Draft/in-review
-- rows are visible to content staff (reviewers included for the queue).
create policy subtopics_public_read_published on public.subtopics
  for select to anon, authenticated
  using (status = 'published');

create policy subtopics_staff_read on public.subtopics
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

-- Staff writes. Reviewer state transitions (approve / request changes) run
-- through M4 server actions with the service role — reviewers get no direct
-- write policy.
create policy subjects_staff_write on public.subjects
  for all to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy chapters_staff_write on public.chapters
  for all to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy topics_staff_write on public.topics
  for all to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy subtopics_staff_write on public.subtopics
  for all to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));
