-- RLS probe · 19 — delete_content_node (migration 023)
-- Asserts: content_manager is refused; admin deletes a chapter and the
-- whole subtree + dependents + slug_history go with it; direct API deletes
-- stay blocked by RLS; missing node raises.

\set ON_ERROR_STOP on

-- Scratch subtree under the probe subject: chapter → topic → subtopic,
-- plus a chapter-direct page, study data, and slug history rows.
insert into public.chapters (id, subject_id, name, slug, sort_order)
values ('f0000000-0000-4000-a000-000000000090',
        'f0000000-0000-4000-a000-000000000010',
        'Delete Probe Chapter', 'rls-delete-chapter', 99);

insert into public.topics (id, chapter_id, name, slug, sort_order)
values ('f0000000-0000-4000-a000-000000000091',
        'f0000000-0000-4000-a000-000000000090',
        'Delete Probe Topic', 'rls-delete-topic', 1);

insert into public.subtopics (id, topic_id, title, slug, sort_order)
values ('f0000000-0000-4000-a000-000000000092',
        'f0000000-0000-4000-a000-000000000091',
        'Delete Probe Subtopic', 'rls-delete-subtopic', 1);

insert into public.subtopics (id, chapter_id, title, slug, sort_order)
values ('f0000000-0000-4000-a000-000000000093',
        'f0000000-0000-4000-a000-000000000090',
        'Delete Probe Page', 'rls-delete-page', 1);

insert into public.highlights (user_id, subtopic_id, anchor, text_snapshot, color)
values ('00000000-0000-4000-a000-000000000001',
        'f0000000-0000-4000-a000-000000000092',
        '{"v":1,"block_id":"b1","kind":"prose","path":[],"start":0,"end":3,"snapshot":"Del"}'::jsonb,
        'Del', 'amber');

insert into public.slug_history (entity_id, level, old_slug, new_slug, parent_path)
values ('f0000000-0000-4000-a000-000000000092', 'subtopic',
        'old-delete-probe', 'rls-delete-subtopic',
        'rls-probe-subject/rls-delete-chapter/rls-delete-topic');

-- Probe 1: content_manager is refused; the tree is untouched.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090');
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  if not denied then
    raise exception 'FAIL 19.1: content_manager was allowed to delete';
  end if;
  if not exists (select 1 from public.chapters where id = 'f0000000-0000-4000-a000-000000000090') then
    raise exception 'FAIL 19.1: chapter vanished on a refused call';
  end if;
  raise notice 'PASS 19.1: content_manager refused';
end;
$probe$;

-- Probe 2: direct API delete (no RPC) is blocked by RLS even for admin.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  delete from public.chapters where id = 'f0000000-0000-4000-a000-000000000090';
  reset role;

  select count(*) into n from public.chapters where id = 'f0000000-0000-4000-a000-000000000090';
  if n <> 1 then
    raise exception 'FAIL 19.2: direct API delete slipped past RLS';
  end if;
  raise notice 'PASS 19.2: direct API delete blocked (RPC is the only path)';
end;
$probe$;

-- Probe 3: admin deletes the chapter via the RPC — subtree, dependents,
-- and slug history all go; unrelated fixtures survive.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  perform public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090');
  reset role;

  select count(*) into n from public.chapters where id = 'f0000000-0000-4000-a000-000000000090';
  n := n + (select count(*) from public.topics where id = 'f0000000-0000-4000-a000-000000000091');
  n := n + (select count(*) from public.subtopics
             where id in ('f0000000-0000-4000-a000-000000000092',
                          'f0000000-0000-4000-a000-000000000093'));
  n := n + (select count(*) from public.highlights
             where subtopic_id = 'f0000000-0000-4000-a000-000000000092');
  n := n + (select count(*) from public.slug_history
             where entity_id = 'f0000000-0000-4000-a000-000000000092');
  if n <> 0 then
    raise exception 'FAIL 19.3: % leftover rows after chapter delete', n;
  end if;

  if not exists (select 1 from public.chapters where id = 'f0000000-0000-4000-a000-000000000011') then
    raise exception 'FAIL 19.3: unrelated fixture chapter was deleted';
  end if;
  raise notice 'PASS 19.3: admin delete cascades subtree + dependents + history';
end;
$probe$;

-- Probe 4: missing node raises (never a silent no-op).
do $probe$
declare
  raised boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090');
  exception
    when others then raised := true;
  end;
  reset role;

  if not raised then
    raise exception 'FAIL 19.4: deleting a missing node did not raise';
  end if;
  raise notice 'PASS 19.4: missing node raises';
end;
$probe$;

select 'DELETE-CONTENT PROBES PASSED' as status;
