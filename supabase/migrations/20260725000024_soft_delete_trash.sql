-- 024 · Soft delete + 14-day trash (founder amendment to 023, 2026-07-25)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- 023's delete_content_node becomes a SOFT delete: the subtree is stamped
-- deleted_at and vanishes from every read surface (RLS-level, so the app,
-- search, and reader all inherit it), a content_trash event records exactly
-- which rows were stamped, and restore/purge RPCs operate on that event.
-- A daily cron purges events past deleted_at + 14 days (hard cascade +
-- slug_history sweep). While trashed, a node still occupies its slug
-- namespace (unique indexes ignore deleted_at) — restores can never
-- collide; the slug frees at purge.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.subjects add column deleted_at timestamptz;
alter table public.chapters add column deleted_at timestamptz;
alter table public.topics add column deleted_at timestamptz;
alter table public.subtopics add column deleted_at timestamptz;

-- API roles never set deleted_at directly — the RPCs are the only writers
-- (definer runs as owner, so the guard does not fire for them).
create or replace function public.content_guard_deleted_at()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.deleted_at is distinct from old.deleted_at then
    raise exception 'deleted_at changes only through the trash RPCs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger subjects_guard_deleted_at
  before update on public.subjects
  for each row execute function public.content_guard_deleted_at();
create trigger chapters_guard_deleted_at
  before update on public.chapters
  for each row execute function public.content_guard_deleted_at();
create trigger topics_guard_deleted_at
  before update on public.topics
  for each row execute function public.content_guard_deleted_at();
create trigger subtopics_guard_deleted_at
  before update on public.subtopics
  for each row execute function public.content_guard_deleted_at();

-- ---------------------------------------------------------------------------
-- Visibility: every select/update policy on the tree excludes trashed rows.
-- (Search, the reader, the CMS tree, and rollups all read through these.)
-- ---------------------------------------------------------------------------
drop policy subjects_public_read on public.subjects;
create policy subjects_public_read on public.subjects
  for select to anon, authenticated using (deleted_at is null);

drop policy chapters_public_read on public.chapters;
create policy chapters_public_read on public.chapters
  for select to anon, authenticated using (deleted_at is null);

drop policy topics_public_read on public.topics;
create policy topics_public_read on public.topics
  for select to anon, authenticated using (deleted_at is null);

drop policy subtopics_public_read_published on public.subtopics;
create policy subtopics_public_read_published on public.subtopics
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

drop policy subtopics_staff_read on public.subtopics;
create policy subtopics_staff_read on public.subtopics
  for select to authenticated
  using (
    deleted_at is null
    and public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin'])
  );

-- Trashed rows are read-only until restored (no staff edits in the trash).
drop policy subjects_staff_update on public.subjects;
create policy subjects_staff_update on public.subjects
  for update to authenticated
  using (deleted_at is null
         and public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

drop policy chapters_staff_update on public.chapters;
create policy chapters_staff_update on public.chapters
  for update to authenticated
  using (deleted_at is null
         and public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

drop policy topics_staff_update on public.topics;
create policy topics_staff_update on public.topics
  for update to authenticated
  using (deleted_at is null
         and public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

drop policy subtopics_staff_update on public.subtopics;
create policy subtopics_staff_update on public.subtopics
  for update to authenticated
  using (deleted_at is null
         and public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- The trash ledger: one row per deletion event, carrying EXACTLY the row ids
-- it stamped (rows already trashed by an earlier event are never re-stamped,
-- so nested deletions stay disjoint and restores never resurrect them).
-- ---------------------------------------------------------------------------
create table public.content_trash (
  id uuid primary key default gen_random_uuid(),
  level public.content_level not null,
  entity_id uuid not null,
  name text not null,
  slug text not null,
  entity_ids uuid[] not null,
  pages int not null default 0,
  published int not null default 0,
  deleted_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz not null default now(),
  purge_after timestamptz not null,
  restored_at timestamptz,
  purged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_trash_open_idx
  on public.content_trash (deleted_at desc)
  where restored_at is null and purged_at is null;

create trigger content_trash_set_updated_at
  before update on public.content_trash
  for each row execute function public.set_updated_at();

alter table public.content_trash enable row level security;

-- Admin-eyes only; all writes via the definer RPCs.
create policy content_trash_admin_read on public.content_trash
  for select to authenticated
  using (public.has_role(array['admin', 'super_admin']));

-- ---------------------------------------------------------------------------
-- delete_content_node → soft delete returning the trash event id.
-- (Return type changes, so the 023 version is dropped first.)
-- ---------------------------------------------------------------------------
drop function public.delete_content_node(public.content_level, uuid);

create function public.delete_content_node(
  p_level public.content_level,
  p_entity_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_name text;
  v_slug text;
  v_pages int;
  v_published int;
  v_trash_id uuid;
  v_now timestamptz := now();
begin
  if not public.has_role(array['admin', 'super_admin']) then
    raise exception 'delete_content_node: admin role required' using errcode = '42501';
  end if;

  -- Collect self + descendants, EXCLUDING rows already in the trash.
  if p_level = 'subject' then
    select name, slug into v_name, v_slug from public.subjects
     where id = p_entity_id and deleted_at is null;
    select array_agg(entity_id) into v_ids from (
      select id as entity_id from public.subjects
       where id = p_entity_id and deleted_at is null
      union all
      select c.id from public.chapters c
       where c.subject_id = p_entity_id and c.deleted_at is null
      union all
      select t.id from public.topics t
        join public.chapters c on c.id = t.chapter_id
       where c.subject_id = p_entity_id and t.deleted_at is null
      union all
      select s.id from public.subtopics s
        left join public.topics t on t.id = s.topic_id
        join public.chapters c on c.id = coalesce(t.chapter_id, s.chapter_id)
       where c.subject_id = p_entity_id and s.deleted_at is null
    ) affected;
  elsif p_level = 'chapter' then
    select name, slug into v_name, v_slug from public.chapters
     where id = p_entity_id and deleted_at is null;
    select array_agg(entity_id) into v_ids from (
      select id as entity_id from public.chapters
       where id = p_entity_id and deleted_at is null
      union all
      select t.id from public.topics t
       where t.chapter_id = p_entity_id and t.deleted_at is null
      union all
      select s.id from public.subtopics s
        left join public.topics t on t.id = s.topic_id
       where (t.chapter_id = p_entity_id or s.chapter_id = p_entity_id)
         and s.deleted_at is null
    ) affected;
  elsif p_level = 'topic' then
    select name, slug into v_name, v_slug from public.topics
     where id = p_entity_id and deleted_at is null;
    select array_agg(entity_id) into v_ids from (
      select id as entity_id from public.topics
       where id = p_entity_id and deleted_at is null
      union all
      select s.id from public.subtopics s
       where s.topic_id = p_entity_id and s.deleted_at is null
    ) affected;
  else
    select title, slug into v_name, v_slug from public.subtopics
     where id = p_entity_id and deleted_at is null;
    select array_agg(id) into v_ids from public.subtopics
     where id = p_entity_id and deleted_at is null;
  end if;

  if v_name is null or v_ids is null then
    raise exception 'delete_content_node: % % not found (or already in the trash)',
      p_level, p_entity_id;
  end if;

  select count(*), count(*) filter (where status = 'published')
    into v_pages, v_published
    from public.subtopics where id = any (v_ids);

  update public.subjects set deleted_at = v_now where id = any (v_ids) and deleted_at is null;
  update public.chapters set deleted_at = v_now where id = any (v_ids) and deleted_at is null;
  update public.topics set deleted_at = v_now where id = any (v_ids) and deleted_at is null;
  update public.subtopics set deleted_at = v_now where id = any (v_ids) and deleted_at is null;

  insert into public.content_trash
    (level, entity_id, name, slug, entity_ids, pages, published,
     deleted_by, deleted_at, purge_after)
  values
    (p_level, p_entity_id, v_name, v_slug, v_ids, v_pages, v_published,
     auth.uid(), v_now, v_now + interval '14 days')
  returning id into v_trash_id;

  return v_trash_id;
end;
$$;

comment on function public.delete_content_node(public.content_level, uuid) is
  'SOFT delete (024): stamps deleted_at over the not-yet-trashed subtree, records a content_trash event (exact row ids, counts, 14-day purge_after), returns the event id. admin/super_admin only. Restore via restore_content_node; hard purge via purge_content_trash.';

revoke all on function public.delete_content_node(public.content_level, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_content_node(public.content_level, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- restore_content_node: un-trash exactly one event's rows.
-- ---------------------------------------------------------------------------
create function public.restore_content_node(p_trash_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.content_trash%rowtype;
  v_parent_ok boolean;
begin
  if not public.has_role(array['admin', 'super_admin']) then
    raise exception 'restore_content_node: admin role required' using errcode = '42501';
  end if;

  select * into v_event from public.content_trash
   where id = p_trash_id and restored_at is null and purged_at is null
   for update;
  if not found then
    raise exception 'restore_content_node: trash event % not found or already settled', p_trash_id;
  end if;

  -- The destination parent must exist and be out of the trash.
  if v_event.level = 'subject' then
    v_parent_ok := true;
  elsif v_event.level = 'chapter' then
    select exists (
      select 1 from public.subjects s
        join public.chapters c on c.subject_id = s.id
       where c.id = v_event.entity_id and s.deleted_at is null
    ) into v_parent_ok;
  elsif v_event.level = 'topic' then
    select exists (
      select 1 from public.chapters c
        join public.topics t on t.chapter_id = c.id
       where t.id = v_event.entity_id and c.deleted_at is null
    ) into v_parent_ok;
  else
    select exists (
      select 1 from public.subtopics s
        left join public.topics t on t.id = s.topic_id
        join public.chapters c on c.id = coalesce(t.chapter_id, s.chapter_id)
       where s.id = v_event.entity_id
         and c.deleted_at is null
         and (s.topic_id is null or t.deleted_at is null)
    ) into v_parent_ok;
  end if;

  if not v_parent_ok then
    raise exception 'restore_content_node: the parent is deleted — restore it first';
  end if;

  update public.subjects set deleted_at = null
   where id = any (v_event.entity_ids) and deleted_at = v_event.deleted_at;
  update public.chapters set deleted_at = null
   where id = any (v_event.entity_ids) and deleted_at = v_event.deleted_at;
  update public.topics set deleted_at = null
   where id = any (v_event.entity_ids) and deleted_at = v_event.deleted_at;
  update public.subtopics set deleted_at = null
   where id = any (v_event.entity_ids) and deleted_at = v_event.deleted_at;

  update public.content_trash set restored_at = now() where id = p_trash_id;
end;
$$;

comment on function public.restore_content_node(uuid) is
  'Un-trash one deletion event (024): clears deleted_at on exactly the rows that event stamped (timestamp-matched, so nested deletions stay deleted). Refuses when the destination parent is itself trashed. admin/super_admin only.';

revoke all on function public.restore_content_node(uuid)
  from public, anon, authenticated;
grant execute on function public.restore_content_node(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- purge_content_trash: hard-delete settled events — targeted (admin) or all
-- due (daily cron via service role). Cascades do the deep clean; slug_history
-- is swept per event; events absorbed by a larger purge are closed too.
-- ---------------------------------------------------------------------------
create function public.purge_content_trash(p_trash_id uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_nested record;
  v_count int := 0;
begin
  if not (auth.role() = 'service_role'
          or public.has_role(array['admin', 'super_admin'])) then
    raise exception 'purge_content_trash: admin or service role required' using errcode = '42501';
  end if;

  for v_event in
    select * from public.content_trash
     where restored_at is null and purged_at is null
       and ((p_trash_id is not null and id = p_trash_id)
            or (p_trash_id is null and purge_after <= now()))
     order by deleted_at
     for update
  loop
    if v_event.level = 'subject' then
      delete from public.subjects where id = v_event.entity_id;
    elsif v_event.level = 'chapter' then
      delete from public.chapters where id = v_event.entity_id;
    elsif v_event.level = 'topic' then
      delete from public.topics where id = v_event.entity_id;
    else
      delete from public.subtopics where id = v_event.entity_id;
    end if;

    delete from public.slug_history where entity_id = any (v_event.entity_ids);
    update public.content_trash set purged_at = now() where id = v_event.id;

    -- A separately-trashed nested node is NOT in this event's id array (the
    -- arrays are disjoint by design), but the FK cascade just destroyed its
    -- rows. Close every still-open event whose root no longer exists and
    -- sweep ITS slug history too.
    for v_nested in
      select * from public.content_trash
       where purged_at is null and restored_at is null and id <> v_event.id
    loop
      if (v_nested.level = 'subject'
          and not exists (select 1 from public.subjects where id = v_nested.entity_id))
         or (v_nested.level = 'chapter'
             and not exists (select 1 from public.chapters where id = v_nested.entity_id))
         or (v_nested.level = 'topic'
             and not exists (select 1 from public.topics where id = v_nested.entity_id))
         or (v_nested.level = 'subtopic'
             and not exists (select 1 from public.subtopics where id = v_nested.entity_id)) then
        delete from public.slug_history where entity_id = any (v_nested.entity_ids);
        update public.content_trash set purged_at = now() where id = v_nested.id;
      end if;
    end loop;

    v_count := v_count + 1;
  end loop;

  if p_trash_id is not null and v_count = 0 then
    raise exception 'purge_content_trash: trash event % not found or already settled', p_trash_id;
  end if;

  return v_count;
end;
$$;

comment on function public.purge_content_trash(uuid) is
  'Hard purge (024): targeted (admin passes the event id) or every event past purge_after (daily cron, service role). FK cascades clean the subtree; slug_history swept per event; nested events absorbed by an ancestor purge are closed. Returns events purged.';

revoke all on function public.purge_content_trash(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_content_trash(uuid)
  to authenticated, service_role;
