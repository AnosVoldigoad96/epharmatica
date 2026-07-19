-- 006 · Study data: highlights, bookmarks, user_notes, progress, last_visited
-- (master PRD §7.2.6/§9 · M1 §5.5–§5.8 + §6 deltas · M3 provenance for notes)
--
-- All five tables are archetype (a): owner-only RLS (securities.md §4).
-- user_id references auth.users so purge cascades are a backstop — the
-- contractual purge order (M2 §4.7, step 2) still deletes these explicitly.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
-- The four highlighter colors (STYLE tokens hl-amber/mint/lilac/rose).
create type public.highlight_color as enum ('amber', 'mint', 'lilac', 'rose');

create type public.bookmark_target as enum ('subtopic', 'topic');

-- ---------------------------------------------------------------------------
-- highlights — universal typed anchors (M1-4, anchor schema v:1)
-- ---------------------------------------------------------------------------
create table public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  -- M1 §5.5 anchor schema:
  -- { "v": 1, "block_id": "…", "kind": "prose|table|drugcard|code|caption",
  --   "path": [...], "start": n, "end": n, "snapshot": "…" }
  -- The "v" field enables future anchor-schema migrations.
  anchor jsonb not null,
  text_snapshot text not null,
  color public.highlight_color not null,
  -- Re-anchoring outcomes (M1 §5.5): snapshot found once elsewhere → moved;
  -- not found → orphaned (surfaces in My Highlights, never silently vanishes).
  moved boolean not null default false,
  orphaned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint highlights_anchor_v1
    check (jsonb_typeof(anchor) = 'object' and (anchor ->> 'v')::int = 1),
  constraint highlights_snapshot_max_length
    check (char_length(text_snapshot) <= 1000)
);

create index highlights_user_id_idx on public.highlights (user_id, subtopic_id);
create index highlights_subtopic_id_idx on public.highlights (subtopic_id);

create trigger highlights_set_updated_at
  before update on public.highlights
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- bookmarks — subtopic + topic level only (M1 §5.7)
-- ---------------------------------------------------------------------------
-- target_id points at subtopics.id or topics.id depending on target_type;
-- no FK is possible across two tables — integrity is app-enforced and
-- dangling bookmarks render as removed content.
create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_type public.bookmark_target not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookmarks_unique_target unique (user_id, target_type, target_id)
);

create index bookmarks_user_id_idx on public.bookmarks (user_id);

create trigger bookmarks_set_updated_at
  before update on public.bookmarks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_notes — one table, two surfaces (M1-5); AI provenance (M3)
-- ---------------------------------------------------------------------------
create table public.user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  -- Null = free subtopic note; set = note attached to a highlight. Deleting
  -- a highlight with a note prompts once in the UI, then deletes both
  -- (the cascade backs the atomic delete).
  highlight_id uuid references public.highlights (id) on delete cascade,
  -- Lightweight Plate JSON (marks + lists only) — still invariant I9.
  content jsonb not null,
  -- M3 save-to-notes provenance: 'user' | 'ai'; source_label e.g.
  -- 'groq · llama-3.3-70b-versatile'. The M2 export carries source through.
  source text not null default 'user',
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_notes_content_is_array check (jsonb_typeof(content) = 'array'),
  constraint user_notes_source_known check (source in ('user', 'ai'))
);

create index user_notes_user_id_idx on public.user_notes (user_id, subtopic_id);
create index user_notes_highlight_id_idx on public.user_notes (highlight_id);

create trigger user_notes_set_updated_at
  before update on public.user_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- progress — manual mark-as-complete (D5); roll-ups computed at read time
-- ---------------------------------------------------------------------------
create table public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Concurrent mark-complete taps are idempotent via this constraint (M1 §9).
  constraint progress_unique_per_subtopic unique (user_id, subtopic_id)
);

create index progress_user_id_idx on public.progress (user_id);

create trigger progress_set_updated_at
  before update on public.progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- last_visited — single row per user (pk = user_id), powers dashboard
-- "Continue where you left off" (M1 §5.2, upsert on reader open)
-- ---------------------------------------------------------------------------
create table public.last_visited (
  user_id uuid primary key references auth.users (id) on delete cascade,
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  visited_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger last_visited_set_updated_at
  before update on public.last_visited
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — archetype (a): owner-only, all five tables
-- ---------------------------------------------------------------------------
alter table public.highlights enable row level security;
alter table public.bookmarks enable row level security;
alter table public.user_notes enable row level security;
alter table public.progress enable row level security;
alter table public.last_visited enable row level security;

create policy highlights_owner_all on public.highlights
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy bookmarks_owner_all on public.bookmarks
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy user_notes_owner_all on public.user_notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy progress_owner_all on public.progress
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy last_visited_owner_all on public.last_visited
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
