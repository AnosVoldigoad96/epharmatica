-- RLS probe · 20 — study-tools RPCs (migration 025)
-- Asserts: atomic highlight+note creation under owner RLS; reanchor fetch/
-- apply are content_manager+ only; apply honors the action taxonomy and is
-- scoped to the given subtopic; highlight deletion cascades the note.

\set ON_ERROR_STOP on

-- Probe 1: USER A creates highlight + note atomically; both owner-stamped.
do $probe$
declare
  v_id uuid;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select public.create_highlight_with_note(
    'f0000000-0000-4000-a000-000000000013',
    '{"v":1,"block_id":"b1","kind":"prose","path":[],"start":0,"end":9,"snapshot":"Published"}'::jsonb,
    'mint',
    '[{"type":"p","children":[{"text":"probe note"}]}]'::jsonb
  ) into v_id;
  reset role;

  select count(*) into n from public.highlights
   where id = v_id
     and user_id = '00000000-0000-4000-a000-000000000001'
     and text_snapshot = 'Published' and color = 'mint'
     and moved = false and orphaned = false;
  n := n + (select count(*) from public.user_notes
             where highlight_id = v_id
               and user_id = '00000000-0000-4000-a000-000000000001');
  if n <> 2 then
    raise exception 'FAIL 20.1: atomic pair incomplete (% of 2 rows)', n;
  end if;
  raise notice 'PASS 20.1: highlight + note created atomically, owner-stamped';
end;
$probe$;

-- Probe 2: reanchor_fetch — empty for a plain user, populated for CM.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.reanchor_fetch('f0000000-0000-4000-a000-000000000013');
  reset role;
  if n <> 0 then
    raise exception 'FAIL 20.2: plain user read % anchors via reanchor_fetch', n;
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.reanchor_fetch('f0000000-0000-4000-a000-000000000013');
  reset role;
  if n < 1 then
    raise exception 'FAIL 20.2: CM saw no anchors via reanchor_fetch';
  end if;
  raise notice 'PASS 20.2: reanchor_fetch gated to content_manager+';
end;
$probe$;

-- Probe 3: reanchor_apply — plain user 42501; CM applies repath/move/orphan
-- with correct flags; unknown action raises; wrong subtopic scope is a no-op.
do $probe$
declare
  v_id uuid;
  denied boolean := false;
  raised boolean := false;
  v_moved boolean;
  v_orphaned boolean;
  v_anchor jsonb;
begin
  select id into v_id from public.highlights
   where user_id = '00000000-0000-4000-a000-000000000001'
     and subtopic_id = 'f0000000-0000-4000-a000-000000000013'
     and text_snapshot = 'Published';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.reanchor_apply('f0000000-0000-4000-a000-000000000013',
      jsonb_build_array(jsonb_build_object('id', v_id, 'action', 'orphan')));
  exception when insufficient_privilege then denied := true;
  end;
  reset role;
  if not denied then
    raise exception 'FAIL 20.3: plain user was allowed to reanchor_apply';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  -- repath: anchor replaced, moved stays false.
  perform public.reanchor_apply('f0000000-0000-4000-a000-000000000013',
    jsonb_build_array(jsonb_build_object(
      'id', v_id, 'action', 'repath',
      'anchor', '{"v":1,"block_id":"b2","kind":"prose","path":[],"start":4,"end":13,"snapshot":"Published"}'::jsonb)));

  -- wrong-subtopic scope: must not touch the row.
  perform public.reanchor_apply('f0000000-0000-4000-a000-000000000014',
    jsonb_build_array(jsonb_build_object('id', v_id, 'action', 'orphan')));

  -- move: moved=true.
  perform public.reanchor_apply('f0000000-0000-4000-a000-000000000013',
    jsonb_build_array(jsonb_build_object(
      'id', v_id, 'action', 'move',
      'anchor', '{"v":1,"block_id":"b9","kind":"prose","path":[],"start":0,"end":9,"snapshot":"Published"}'::jsonb)));

  begin
    perform public.reanchor_apply('f0000000-0000-4000-a000-000000000013',
      jsonb_build_array(jsonb_build_object('id', v_id, 'action', 'obliterate')));
  exception when others then raised := true;
  end;
  reset role;

  select moved, orphaned, anchor into v_moved, v_orphaned, v_anchor
    from public.highlights where id = v_id;
  if v_orphaned then
    raise exception 'FAIL 20.3: wrong-subtopic apply reached the row';
  end if;
  if not v_moved or (v_anchor ->> 'block_id') <> 'b9' then
    raise exception 'FAIL 20.3: move did not apply (moved=%, block=%)', v_moved, v_anchor ->> 'block_id';
  end if;
  if not raised then
    raise exception 'FAIL 20.3: unknown action did not raise';
  end if;

  -- orphan path: flag set, row retained.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.reanchor_apply('f0000000-0000-4000-a000-000000000013',
    jsonb_build_array(jsonb_build_object('id', v_id, 'action', 'orphan')));
  reset role;
  if not exists (select 1 from public.highlights where id = v_id and orphaned = true) then
    raise exception 'FAIL 20.3: orphan action did not flag the row';
  end if;
  raise notice 'PASS 20.3: reanchor_apply gated, scoped, and action-correct';
end;
$probe$;

-- Probe 4: owner deletes the highlight — the attached note cascades.
do $probe$
declare
  v_id uuid;
  n int;
begin
  select id into v_id from public.highlights
   where user_id = '00000000-0000-4000-a000-000000000001'
     and subtopic_id = 'f0000000-0000-4000-a000-000000000013'
     and text_snapshot = 'Published';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  delete from public.highlights where id = v_id;
  reset role;

  select count(*) into n from public.highlights where id = v_id;
  n := n + (select count(*) from public.user_notes where highlight_id = v_id);
  if n <> 0 then
    raise exception 'FAIL 20.4: % rows survived the cascade delete', n;
  end if;
  raise notice 'PASS 20.4: highlight delete cascades its note';
end;
$probe$;

select 'STUDY-TOOLS PROBES PASSED' as status;
