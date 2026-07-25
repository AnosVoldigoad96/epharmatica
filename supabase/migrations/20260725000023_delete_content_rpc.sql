-- 023 · delete_content_node RPC (founder directive 2026-07-25)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- Hard delete for the content tree, admin + super_admin ONLY (content
-- managers archive; deletion is a founder/admin act). One RPC per the house
-- pattern (move/rename/transition): SECURITY DEFINER with the role gate
-- inside, so RLS stays deny-by-default for direct API deletes.
--
-- Every dependent FK in the graph is ON DELETE CASCADE (tree 004/020,
-- revisions + review events 005, study data 006, discussions 018, preview
-- links / media refs / claims 012), so a single delete at any level cleans
-- the whole subtree transactionally. slug_history rows carry no FK — the
-- RPC collects the affected entity ids FIRST and sweeps their history so
-- dead 301 sources don't linger.

-- ---------------------------------------------------------------------------
-- Tighten 004: the staff_write policies were FOR ALL, which includes DELETE —
-- an author could hard-delete a subject through the raw API. Split them:
-- insert/update keep the same roles; DELETE gets NO policy (deny-by-default),
-- making the admin-gated RPC below the single deletion path.
-- ---------------------------------------------------------------------------

drop policy subjects_staff_write on public.subjects;
drop policy chapters_staff_write on public.chapters;
drop policy topics_staff_write on public.topics;
drop policy subtopics_staff_write on public.subtopics;

create policy subjects_staff_insert on public.subjects
  for insert to authenticated
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy subjects_staff_update on public.subjects
  for update to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy chapters_staff_insert on public.chapters
  for insert to authenticated
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy chapters_staff_update on public.chapters
  for update to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy topics_staff_insert on public.topics
  for insert to authenticated
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy topics_staff_update on public.topics
  for update to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy subtopics_staff_insert on public.subtopics
  for insert to authenticated
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create policy subtopics_staff_update on public.subtopics
  for update to authenticated
  using (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']))
  with check (public.has_role(array['author', 'content_manager', 'admin', 'super_admin']));

create or replace function public.delete_content_node(
  p_level public.content_level,
  p_entity_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not public.has_role(array['admin', 'super_admin']) then
    raise exception 'delete_content_node: admin role required' using errcode = '42501';
  end if;

  -- Collect self + descendants BEFORE the cascade wipes the tree.
  if p_level = 'subject' then
    select array_agg(entity_id) into v_ids from (
      select id as entity_id from public.subjects where id = p_entity_id
      union all
      select c.id from public.chapters c where c.subject_id = p_entity_id
      union all
      select t.id from public.topics t
        join public.chapters c on c.id = t.chapter_id
       where c.subject_id = p_entity_id
      union all
      select s.id from public.subtopics s
        left join public.topics t on t.id = s.topic_id
        join public.chapters c on c.id = coalesce(t.chapter_id, s.chapter_id)
       where c.subject_id = p_entity_id
    ) affected;
  elsif p_level = 'chapter' then
    select array_agg(entity_id) into v_ids from (
      select id as entity_id from public.chapters where id = p_entity_id
      union all
      select t.id from public.topics t where t.chapter_id = p_entity_id
      union all
      select s.id from public.subtopics s
        left join public.topics t on t.id = s.topic_id
       where t.chapter_id = p_entity_id or s.chapter_id = p_entity_id
    ) affected;
  elsif p_level = 'topic' then
    select array_agg(entity_id) into v_ids from (
      select id as entity_id from public.topics where id = p_entity_id
      union all
      select s.id from public.subtopics s where s.topic_id = p_entity_id
    ) affected;
  else
    select array_agg(id) into v_ids from public.subtopics where id = p_entity_id;
  end if;

  if v_ids is null then
    raise exception 'delete_content_node: % % not found', p_level, p_entity_id;
  end if;

  if p_level = 'subject' then
    delete from public.subjects where id = p_entity_id;
  elsif p_level = 'chapter' then
    delete from public.chapters where id = p_entity_id;
  elsif p_level = 'topic' then
    delete from public.topics where id = p_entity_id;
  else
    delete from public.subtopics where id = p_entity_id;
  end if;

  delete from public.slug_history where entity_id = any (v_ids);
end;
$$;

comment on function public.delete_content_node(public.content_level, uuid) is
  'Hard delete of a content node and (via FK cascades) its entire subtree, plus slug-history sweep for every deleted entity. admin/super_admin only — content managers archive instead. App layer owns typed confirmation, audit, and cache purge.';

-- Hard revoke, then the API role: the gate inside the function decides.
revoke all on function public.delete_content_node(public.content_level, uuid)
  from public, anon, authenticated;

grant execute on function public.delete_content_node(public.content_level, uuid)
  to authenticated, service_role;
