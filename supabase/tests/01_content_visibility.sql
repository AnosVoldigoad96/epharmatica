-- RLS probe · 01 — content visibility
-- Asserts: anon CANNOT select draft subtopics; anon CAN select published.
-- Each probe is one DO block: it switches to the API role with SET LOCAL
-- (scoped to the statement's transaction), runs the query, and raises on
-- violation. psql -v ON_ERROR_STOP=1 turns any raise into a nonzero exit.

\set ON_ERROR_STOP on

-- Probe 1: anon cannot see ANY non-published subtopic row.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select count(*) into n from public.subtopics where status <> 'published';

  reset role;

  if n <> 0 then
    raise exception 'FAIL 01.1: anon can select % non-published subtopic row(s)', n;
  end if;
  raise notice 'PASS 01.1: anon cannot select draft/unpublished subtopics';
end;
$probe$;

-- Probe 2: the draft fixture specifically is invisible to anon.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select count(*) into n
    from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';

  reset role;

  if n <> 0 then
    raise exception 'FAIL 01.2: anon can select the draft fixture subtopic';
  end if;
  raise notice 'PASS 01.2: draft fixture invisible to anon';
end;
$probe$;

-- Probe 3: anon CAN select the published fixture (full row — the preview
-- gate is a data-layer truncation, not RLS; I3).
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select count(*) into n
    from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000013'
     and status = 'published';

  reset role;

  if n <> 1 then
    raise exception 'FAIL 01.3: anon cannot select the published fixture subtopic';
  end if;
  raise notice 'PASS 01.3: anon can select published subtopics';
end;
$probe$;

-- Probe 4: a plain authenticated user (no staff role) also cannot see drafts.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.subtopics where status <> 'published';

  reset role;

  if n <> 0 then
    raise exception 'FAIL 01.4: non-staff authenticated user can select % draft row(s)', n;
  end if;
  raise notice 'PASS 01.4: non-staff authenticated user cannot select drafts';
end;
$probe$;

select 'CONTENT VISIBILITY PROBES PASSED' as status;
