-- RLS probe · 16 — published snapshot model (1.C · securities.md §5 M4/M1)
-- Asserts: anon cannot read the live draft columns at all (column grants);
-- anon reads published_content of published rows; publish copies the
-- snapshot; draft edits after publish do NOT move the published surface.

\set ON_ERROR_STOP on

-- Probe 1: anon reads published_content but the live columns are revoked.
do $probe$
declare
  denied boolean := false;
  v_published jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select published_content into v_published
    from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000013';

  begin
    perform content from public.subtopics
     where id = 'f0000000-0000-4000-a000-000000000013';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if v_published is null then
    raise exception 'FAIL 16.1: anon cannot read published_content of a published row';
  end if;
  if not denied then
    raise exception 'FAIL 16.1: anon can read the live content column';
  end if;
  raise notice 'PASS 16.1: anon sees the published surface only';
end;
$probe$;

-- Probe 2: the publish flow copies the snapshot; later draft edits leave
-- it untouched (submit → approve → publish → edit draft → compare).
do $probe$
declare
  v_pub jsonb;
  v_live jsonb;
begin
  -- Reset the draft fixture through the workflow to published.
  update public.subtopics set status = 'draft', published_at = null
   where id = 'f0000000-0000-4000-a000-000000000014';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'submit', null);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'approve', null);
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.publish_subtopic('f0000000-0000-4000-a000-000000000014', null, 1);
  reset role;

  -- Author edits the live draft AFTER publish.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  update public.subtopics
     set content = '[{"id":"b-edit","type":"p","children":[{"text":"Mid-edit draft — must not go live."}]}]'::jsonb,
         plain_text = 'Mid-edit draft — must not go live.'
   where id = 'f0000000-0000-4000-a000-000000000014';
  reset role;

  select published_content, content into v_pub, v_live
    from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';

  -- Restore fixture status for later suites.
  update public.subtopics
     set status = 'draft', published_at = null
   where id = 'f0000000-0000-4000-a000-000000000014';

  if v_pub is null then
    raise exception 'FAIL 16.2: publish did not copy the snapshot';
  end if;
  if v_pub = v_live then
    raise exception 'FAIL 16.2: published surface moved with the draft edit';
  end if;
  if v_pub::text like '%Mid-edit draft%' then
    raise exception 'FAIL 16.2: draft text leaked into the published snapshot';
  end if;
  raise notice 'PASS 16.2: publish snapshots; draft edits never move the published surface';
end;
$probe$;

select 'PUBLISHED-SNAPSHOT PROBES PASSED' as status;
