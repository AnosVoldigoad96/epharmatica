-- RLS probe · 18 — public search RPC (migration 022)
-- Asserts: anon can search and hits published content with sentinel-marked
-- snippets; draft-only text is invisible (I3 — the vector is built from the
-- publish snapshot, and RLS hides draft rows from anon regardless).

\set ON_ERROR_STOP on

-- Probe 1: anon finds published content; snippet carries the sentinels.
do $probe$
declare
  v_count int;
  v_snippet text;
  v_subject text;
begin
  set local role anon;
  select count(*) into v_count from public.search_published('fixture');
  if v_count < 1 then
    reset role;
    raise exception 'FAIL 18.1: anon search found no published fixture';
  end if;

  select snippet, subject_slug into v_snippet, v_subject
    from public.search_published('fixture') limit 1;
  reset role;

  if position('[[[' in v_snippet) = 0 or position(']]]' in v_snippet) = 0 then
    raise exception 'FAIL 18.1: snippet lacks sentinel markers: %', v_snippet;
  end if;
  if v_subject <> 'rls-probe-subject' then
    raise exception 'FAIL 18.1: wrong subject slug %', v_subject;
  end if;
  raise notice 'PASS 18.1: anon search hits published content with sentinels';
end;
$probe$;

-- Probe 2: draft-only text never surfaces ("leak" exists only in the draft
-- fixture's live plain_text — not in any publish snapshot).
do $probe$
declare
  v_count int;
begin
  set local role anon;
  select count(*) into v_count from public.search_published('leak');
  reset role;
  if v_count <> 0 then
    raise exception 'FAIL 18.2: draft-only text leaked into search';
  end if;
  raise notice 'PASS 18.2: draft-only text invisible to search';
end;
$probe$;

-- Probe 3: garbage/empty queries return empty, never error.
do $probe$
declare
  v_count int;
begin
  set local role anon;
  select count(*) into v_count from public.search_published('');
  select v_count + count(*) into v_count from public.search_published('   ');
  select v_count + count(*) into v_count from public.search_published(null);
  reset role;
  if v_count <> 0 then
    raise exception 'FAIL 18.3: trivial query returned rows';
  end if;
  raise notice 'PASS 18.3: empty/garbage queries return empty';
end;
$probe$;

select 'SEARCH PROBES PASSED' as status;
