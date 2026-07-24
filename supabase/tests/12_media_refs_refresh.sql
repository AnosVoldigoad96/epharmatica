-- RLS probe · 12 — refresh_media_refs (M4 §6 · securities.md §5 M4)
-- Asserts: the usage-scan RPC is staff-only, replaces exactly one
-- (subtopic, source) slice, skips unknown asset ids, and leaves the other
-- source's rows untouched.

\set ON_ERROR_STOP on

-- Probe 1: non-staff cannot refresh; author can (replace-all semantics).
do $probe$
declare
  denied boolean := false;
  n_pub int;
  n_draft int;
begin
  -- Non-staff denied.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.refresh_media_refs('f0000000-0000-4000-a000-000000000013',
      array['f0000000-0000-4000-a000-000000000030']::uuid[], 'draft');
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  if not denied then
    raise exception 'FAIL 12.1: non-staff user could refresh media refs';
  end if;

  -- Author writes the draft slice: unused asset + one unknown id (skipped).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  perform public.refresh_media_refs('f0000000-0000-4000-a000-000000000013',
    array['f0000000-0000-4000-a000-000000000031',
          '00000000-0000-4000-a000-00000000dead']::uuid[], 'draft');
  reset role;

  select count(*) into n_draft from public.media_refs
   where subtopic_id = 'f0000000-0000-4000-a000-000000000013' and source = 'draft';
  select count(*) into n_pub from public.media_refs
   where subtopic_id = 'f0000000-0000-4000-a000-000000000013' and source = 'published';

  if n_draft <> 1 then
    raise exception 'FAIL 12.1: draft slice has % rows (expected 1, unknown id skipped)', n_draft;
  end if;
  if n_pub <> 1 then
    raise exception 'FAIL 12.1: published slice was touched by a draft refresh (% rows)', n_pub;
  end if;

  -- Replace-all: an empty refresh clears the draft slice only.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  perform public.refresh_media_refs('f0000000-0000-4000-a000-000000000013',
    '{}'::uuid[], 'draft');
  reset role;

  select count(*) into n_draft from public.media_refs
   where subtopic_id = 'f0000000-0000-4000-a000-000000000013' and source = 'draft';
  select count(*) into n_pub from public.media_refs
   where subtopic_id = 'f0000000-0000-4000-a000-000000000013' and source = 'published';

  if n_draft <> 0 or n_pub <> 1 then
    raise exception 'FAIL 12.1: empty refresh left draft=% published=%', n_draft, n_pub;
  end if;
  raise notice 'PASS 12.1: refresh is staff-only, sliced by source, skips unknown ids';
end;
$probe$;

-- Probe 2: bad source rejected.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.refresh_media_refs('f0000000-0000-4000-a000-000000000013',
      '{}'::uuid[], 'sideways');
  exception
    when others then denied := true;
  end;
  reset role;

  if not denied then
    raise exception 'FAIL 12.2: unknown source value accepted';
  end if;
  raise notice 'PASS 12.2: unknown source rejected';
end;
$probe$;

select 'MEDIA-REFS REFRESH PROBES PASSED' as status;
