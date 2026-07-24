-- RLS probe · 10 — move_content_node (M4 §5.3 · securities.md §5 M4)
-- Asserts: the Move RPC is content_manager+ only; draft moves reparent with
-- NO slug_history ceremony; published moves write the 301 history row and
-- return the affected subtopic ids; bad destinations fail atomically.

\set ON_ERROR_STOP on

-- Probe 1: author and reviewer cannot move nodes (42501 from inside the RPC).
do $probe$
declare
  denied_author boolean := false;
  denied_reviewer boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.move_content_node('subtopic',
      'f0000000-0000-4000-a000-000000000014',
      'f0000000-0000-4000-a000-000000000015');
  exception
    when insufficient_privilege then denied_author := true;
  end;
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.move_content_node('subtopic',
      'f0000000-0000-4000-a000-000000000014',
      'f0000000-0000-4000-a000-000000000015');
  exception
    when insufficient_privilege then denied_reviewer := true;
  end;
  reset role;

  if not denied_author then
    raise exception 'FAIL 10.1: author could move a node';
  end if;
  if not denied_reviewer then
    raise exception 'FAIL 10.1: reviewer could move a node';
  end if;
  raise notice 'PASS 10.1: move is content_manager+ only';
end;
$probe$;

-- Probe 2: content manager moves the DRAFT subtopic — reparents, no
-- history rows, empty return (drafts move without ceremony).
do $probe$
declare
  v_result uuid[];
  v_parent uuid;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  select public.move_content_node('subtopic',
    'f0000000-0000-4000-a000-000000000014',
    'f0000000-0000-4000-a000-000000000015') into v_result;

  reset role;

  select topic_id into v_parent from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';
  select count(*) into n from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000014';

  -- Restore the fixture for later probes.
  update public.subtopics set topic_id = 'f0000000-0000-4000-a000-000000000012'
   where id = 'f0000000-0000-4000-a000-000000000014';

  if v_parent <> 'f0000000-0000-4000-a000-000000000015' then
    raise exception 'FAIL 10.2: draft subtopic was not reparented';
  end if;
  if coalesce(array_length(v_result, 1), 0) <> 0 then
    raise exception 'FAIL 10.2: draft move returned affected ids';
  end if;
  if n <> 0 then
    raise exception 'FAIL 10.2: draft move wrote slug_history ceremony';
  end if;
  raise notice 'PASS 10.2: draft moves reparent without ceremony';
end;
$probe$;

-- Probe 3: content manager moves the PUBLISHED subtopic — history row with
-- the OLD parent path, affected ids returned.
do $probe$
declare
  v_result uuid[];
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  select public.move_content_node('subtopic',
    'f0000000-0000-4000-a000-000000000013',
    'f0000000-0000-4000-a000-000000000015') into v_result;

  reset role;

  select count(*) into n from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000013'
     and level = 'subtopic'
     and parent_path = 'rls-probe-subject/rls-probe-chapter/rls-probe-topic'
     and old_slug = 'published-probe-subtopic';

  -- Restore fixture + clean the probe's history rows.
  update public.subtopics set topic_id = 'f0000000-0000-4000-a000-000000000012'
   where id = 'f0000000-0000-4000-a000-000000000013';
  delete from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000013';

  if v_result <> array['f0000000-0000-4000-a000-000000000013']::uuid[] then
    raise exception 'FAIL 10.3: published move did not return the affected id';
  end if;
  if n <> 1 then
    raise exception 'FAIL 10.3: published move did not write the 301 history row';
  end if;
  raise notice 'PASS 10.3: published move writes slug_history and reports ids';
end;
$probe$;

-- Probe 4: bad destinations and subject-level moves fail; nothing changes.
do $probe$
declare
  failed_dest boolean := false;
  failed_subject boolean := false;
  v_parent uuid;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  begin
    perform public.move_content_node('subtopic',
      'f0000000-0000-4000-a000-000000000014',
      '00000000-0000-4000-a000-00000000dead');
  exception
    when others then failed_dest := true;
  end;

  begin
    perform public.move_content_node('subject',
      'f0000000-0000-4000-a000-000000000010',
      'f0000000-0000-4000-a000-000000000010');
  exception
    when others then failed_subject := true;
  end;

  reset role;

  select topic_id into v_parent from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';

  if not failed_dest then
    raise exception 'FAIL 10.4: move to a nonexistent destination succeeded';
  end if;
  if not failed_subject then
    raise exception 'FAIL 10.4: subject-level move was accepted';
  end if;
  if v_parent <> 'f0000000-0000-4000-a000-000000000012' then
    raise exception 'FAIL 10.4: failed move left the node reparented';
  end if;
  raise notice 'PASS 10.4: invalid moves fail atomically';
end;
$probe$;

-- Probe 5: rename ceremony — CM renames the PUBLISHED subtopic's slug:
-- history row old→new written; author denied; draft rename RPC not needed
-- (actions update draft slugs directly under staff_write RLS).
do $probe$
declare
  denied boolean := false;
  v_result uuid[];
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.rename_content_node('subtopic',
      'f0000000-0000-4000-a000-000000000013', 'renamed-by-author');
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  if not denied then
    raise exception 'FAIL 10.5: author could run the rename ceremony';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  select public.rename_content_node('subtopic',
    'f0000000-0000-4000-a000-000000000013', 'published-probe-renamed') into v_result;

  reset role;

  select count(*) into n from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000013'
     and old_slug = 'published-probe-subtopic'
     and new_slug = 'published-probe-renamed';

  -- Restore fixture + clean history.
  update public.subtopics set slug = 'published-probe-subtopic'
   where id = 'f0000000-0000-4000-a000-000000000013';
  delete from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000013';

  if v_result <> array['f0000000-0000-4000-a000-000000000013']::uuid[] then
    raise exception 'FAIL 10.5: rename did not report the affected subtopic';
  end if;
  if n <> 1 then
    raise exception 'FAIL 10.5: rename ceremony did not write the old→new history row';
  end if;
  raise notice 'PASS 10.5: rename ceremony writes 301 history, CM+ only';
end;
$probe$;

-- Probe 6: consequence-sheet highlight count — staff get an aggregate,
-- non-staff are refused, and no row data ever leaves the function.
do $probe$
declare
  denied boolean := false;
  v_count bigint;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.count_affected_highlights(
      array['f0000000-0000-4000-a000-000000000013']::uuid[]);
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  if not denied then
    raise exception 'FAIL 10.6: non-staff user could count highlights';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;

  select public.count_affected_highlights(
    array['f0000000-0000-4000-a000-000000000013']::uuid[]) into v_count;

  reset role;

  -- 00_setup seeds two highlights (user A + user B) on the published fixture.
  if v_count < 2 then
    raise exception 'FAIL 10.6: staff aggregate returned % (expected >= 2)', v_count;
  end if;
  raise notice 'PASS 10.6: highlight aggregate staff-only and correct';
end;
$probe$;

select 'MOVE-NODE PROBES PASSED' as status;
