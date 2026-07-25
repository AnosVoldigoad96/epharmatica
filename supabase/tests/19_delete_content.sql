-- RLS probe · 19 — soft delete + trash lifecycle (migrations 023 + 024)
-- Asserts: CM refused on all three RPCs; direct API deletes blocked; soft
-- delete hides the subtree from anon AND staff while dependents survive;
-- nested deletions stay disjoint through restore; purge hard-cascades,
-- sweeps slug_history, and closes the event.

\set ON_ERROR_STOP on

-- Scratch subtree under the probe subject.
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

-- Probe 1: content_manager refused on delete, restore, and purge.
do $probe$
declare
  denied int := 0;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090');
  exception when insufficient_privilege then denied := denied + 1;
  end;
  begin
    perform public.restore_content_node('f0000000-0000-4000-a000-000000000090');
  exception when insufficient_privilege then denied := denied + 1;
  end;
  begin
    perform public.purge_content_trash();
  exception when insufficient_privilege then denied := denied + 1;
  end;
  reset role;

  if denied <> 3 then
    raise exception 'FAIL 19.1: content_manager passed a trash RPC (%/3 refused)', denied;
  end if;
  raise notice 'PASS 19.1: content_manager refused on delete/restore/purge';
end;
$probe$;

-- Probe 2: direct API deletes and direct deleted_at writes are blocked,
-- even for admin.
do $probe$
declare
  n int;
  guarded boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  delete from public.chapters where id = 'f0000000-0000-4000-a000-000000000090';
  begin
    update public.chapters set deleted_at = now()
     where id = 'f0000000-0000-4000-a000-000000000090';
  exception when insufficient_privilege then guarded := true;
  end;
  reset role;

  select count(*) into n from public.chapters
   where id = 'f0000000-0000-4000-a000-000000000090' and deleted_at is null;
  if n <> 1 then
    raise exception 'FAIL 19.2: direct API delete or deleted_at write slipped past';
  end if;
  if not guarded then
    raise exception 'FAIL 19.2: direct deleted_at update was not guarded';
  end if;
  raise notice 'PASS 19.2: direct deletes and deleted_at writes blocked (RPCs only)';
end;
$probe$;

-- Probe 3: nested-then-outer soft delete — event ids stay disjoint; the
-- subtree vanishes from staff and anon reads; dependents survive.
do $probe$
declare
  v_outer uuid[];
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  perform public.delete_content_node('subtopic', 'f0000000-0000-4000-a000-000000000092');
  perform public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090');

  -- Staff read: nothing in the subtree is visible.
  select count(*) into n from public.subtopics
   where id in ('f0000000-0000-4000-a000-000000000092', 'f0000000-0000-4000-a000-000000000093');
  n := n + (select count(*) from public.chapters where id = 'f0000000-0000-4000-a000-000000000090');
  reset role;
  if n <> 0 then
    raise exception 'FAIL 19.3: trashed rows visible to staff (% rows)', n;
  end if;

  set local role anon;
  select count(*) into n from public.chapters
   where id = 'f0000000-0000-4000-a000-000000000090';
  reset role;
  if n <> 0 then
    raise exception 'FAIL 19.3: trashed chapter visible to anon';
  end if;

  -- The outer event stamped ONLY the 3 not-yet-trashed rows.
  select entity_ids into v_outer from public.content_trash
   where entity_id = 'f0000000-0000-4000-a000-000000000090' and restored_at is null;
  if array_length(v_outer, 1) <> 3
     or 'f0000000-0000-4000-a000-000000000092' = any (v_outer) then
    raise exception 'FAIL 19.3: outer event ids wrong: %', v_outer;
  end if;

  -- Soft: dependents survive.
  if not exists (select 1 from public.highlights
                  where subtopic_id = 'f0000000-0000-4000-a000-000000000092')
     or not exists (select 1 from public.slug_history
                     where entity_id = 'f0000000-0000-4000-a000-000000000092') then
    raise exception 'FAIL 19.3: dependents did not survive a SOFT delete';
  end if;
  raise notice 'PASS 19.3: soft delete hides the subtree; nested events disjoint; dependents survive';
end;
$probe$;

-- Probe 4: restoring the outer event brings back exactly its rows — the
-- earlier-deleted subtopic stays in the trash; double-restore raises.
do $probe$
declare
  v_id uuid;
  n int;
  raised boolean := false;
begin
  select id into v_id from public.content_trash
   where entity_id = 'f0000000-0000-4000-a000-000000000090' and restored_at is null;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  perform public.restore_content_node(v_id);
  reset role;

  select count(*) into n from public.chapters
   where id = 'f0000000-0000-4000-a000-000000000090' and deleted_at is null;
  n := n + (select count(*) from public.topics
             where id = 'f0000000-0000-4000-a000-000000000091' and deleted_at is null);
  n := n + (select count(*) from public.subtopics
             where id = 'f0000000-0000-4000-a000-000000000093' and deleted_at is null);
  if n <> 3 then
    raise exception 'FAIL 19.4: outer restore incomplete (%/3 rows back)', n;
  end if;
  if exists (select 1 from public.subtopics
              where id = 'f0000000-0000-4000-a000-000000000092' and deleted_at is null) then
    raise exception 'FAIL 19.4: restore resurrected a separately-deleted node';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.restore_content_node(v_id);
  exception when others then raised := true;
  end;
  reset role;
  if not raised then
    raise exception 'FAIL 19.4: double restore did not raise';
  end if;
  raise notice 'PASS 19.4: restore is exact and single-shot';
end;
$probe$;

-- Probe 5: purge hard-deletes the subtree, sweeps slug_history, closes the
-- event — and absorbs the still-open nested event.
do $probe$
declare
  v_id uuid;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  select public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090')
    into v_id;
  perform public.purge_content_trash(v_id);
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
    raise exception 'FAIL 19.5: % leftover rows after purge', n;
  end if;

  select count(*) into n from public.content_trash
   where entity_id in ('f0000000-0000-4000-a000-000000000090',
                       'f0000000-0000-4000-a000-000000000092')
     and restored_at is null and purged_at is null;
  if n <> 0 then
    raise exception 'FAIL 19.5: % trash events left open after purge', n;
  end if;

  if not exists (select 1 from public.chapters where id = 'f0000000-0000-4000-a000-000000000011') then
    raise exception 'FAIL 19.5: unrelated fixture chapter was purged';
  end if;

  -- Ledger cleanup so the probe file is re-runnable.
  delete from public.content_trash
   where entity_id in ('f0000000-0000-4000-a000-000000000090',
                       'f0000000-0000-4000-a000-000000000092');
  raise notice 'PASS 19.5: purge cascades, sweeps history, closes + absorbs events';
end;
$probe$;

-- Probe 6: deleting a missing (or never-existing) node raises.
do $probe$
declare
  raised boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.delete_content_node('chapter', 'f0000000-0000-4000-a000-000000000090');
  exception when others then raised := true;
  end;
  reset role;
  if not raised then
    raise exception 'FAIL 19.6: deleting a missing node did not raise';
  end if;
  raise notice 'PASS 19.6: missing node raises';
end;
$probe$;

select 'DELETE-CONTENT PROBES PASSED' as status;
