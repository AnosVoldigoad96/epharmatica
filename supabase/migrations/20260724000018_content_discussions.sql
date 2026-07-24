-- 018 · Review comments & suggestions (M4 §5.4/§5.5 · dev-plan 1.B-3c)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- Design call (flagged in the PR): discussions anchor to a BLOCK
-- (block_id + a text snapshot), not to inline character ranges. Stored
-- content stays schema-pure — review chrome never enters published JSON —
-- and the block ids are the same stable ids the highlight machinery uses.
-- Inline-range comments can upgrade onto the M1 §5.5 anchor system when it
-- lands (1.D) without touching these tables.

create table public.content_discussions (
  id uuid primary key default gen_random_uuid(),
  subtopic_id uuid not null references public.subtopics (id) on delete cascade,
  block_id text not null,
  -- What the reviewer pointed at, captured at creation (drift-tolerant).
  snapshot text,
  -- 'comment' or 'suggestion'; suggestions carry proposed replacement text.
  kind text not null default 'comment',
  suggested_text text,
  status text not null default 'open',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_discussions_kind_known check (kind in ('comment', 'suggestion')),
  constraint content_discussions_status_known check (status in ('open', 'resolved')),
  constraint content_discussions_suggestion_has_text check (
    kind <> 'suggestion' or (suggested_text is not null and length(btrim(suggested_text)) > 0)
  )
);

create index content_discussions_subtopic_idx
  on public.content_discussions (subtopic_id, status, created_at desc);

create trigger content_discussions_set_updated_at
  before update on public.content_discussions
  for each row execute function public.set_updated_at();

create table public.content_discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.content_discussions (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_discussion_replies_body_nonblank check (length(btrim(body)) > 0)
);

create index content_discussion_replies_discussion_idx
  on public.content_discussion_replies (discussion_id, created_at);

create trigger content_discussion_replies_set_updated_at
  before update on public.content_discussion_replies
  for each row execute function public.set_updated_at();

alter table public.content_discussions enable row level security;
alter table public.content_discussion_replies enable row level security;

-- Staff-only, all five content roles (reviewers comment, authors respond).
create policy content_discussions_staff_read on public.content_discussions
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy content_discussions_staff_insert on public.content_discussions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin'])
  );

-- Resolve/reopen: any content staff (resolution is workflow, not ownership).
create policy content_discussions_staff_update on public.content_discussions
  for update to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy content_discussion_replies_staff_read on public.content_discussion_replies
  for select to authenticated
  using (public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']));

create policy content_discussion_replies_staff_insert on public.content_discussion_replies
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin'])
  );

-- No delete policies: review history is part of the editorial record.

insert into public.personal_data_registry (table_name, module, purge_step, notes) values
  ('content_discussions',        'm4-cms', 3, 'created_by → auth.users ON DELETE SET NULL; snapshots are content text, not user PII.'),
  ('content_discussion_replies', 'm4-cms', 3, 'author_id → auth.users ON DELETE SET NULL; reply bodies are editorial record.')
on conflict (table_name) do nothing;
