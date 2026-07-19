-- RLS probe · 02 — owner isolation on study data + profiles/prefs
-- Asserts: user A cannot read user B's highlights, notes, bookmarks,
-- progress, last_visited, or profile row (prefs/email live there) — and CAN
-- read their own (positive control so an accidentally-empty table can't
-- fake a pass).

\set ON_ERROR_STOP on

do $probe$
declare
  a constant uuid := '00000000-0000-4000-a000-000000000001';
  b constant uuid := '00000000-0000-4000-a000-000000000002';
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  -- highlights
  select count(*) into n from public.highlights where user_id = b;
  if n <> 0 then
    raise exception 'FAIL 02.1: user A can read % of user B''s highlights', n;
  end if;
  select count(*) into n from public.highlights where user_id = a;
  if n < 1 then
    raise exception 'FAIL 02.1: user A cannot read their own highlights (positive control)';
  end if;

  -- user_notes
  select count(*) into n from public.user_notes where user_id = b;
  if n <> 0 then
    raise exception 'FAIL 02.2: user A can read % of user B''s notes', n;
  end if;
  select count(*) into n from public.user_notes where user_id = a;
  if n < 1 then
    raise exception 'FAIL 02.2: user A cannot read their own notes (positive control)';
  end if;

  -- bookmarks
  select count(*) into n from public.bookmarks where user_id = b;
  if n <> 0 then
    raise exception 'FAIL 02.3: user A can read % of user B''s bookmarks', n;
  end if;

  -- progress
  select count(*) into n from public.progress where user_id = b;
  if n <> 0 then
    raise exception 'FAIL 02.4: user A can read % of user B''s progress rows', n;
  end if;

  -- last_visited
  select count(*) into n from public.last_visited where user_id = b;
  if n <> 0 then
    raise exception 'FAIL 02.5: user A can read user B''s last_visited row';
  end if;

  -- profiles (prefs + email mirror live here): B's row must be invisible.
  select count(*) into n from public.profiles where id = b;
  if n <> 0 then
    raise exception 'FAIL 02.6: user A can read user B''s profile (prefs leak)';
  end if;
  select count(*) into n from public.profiles where id = a;
  if n <> 1 then
    raise exception 'FAIL 02.6: user A cannot read their own profile (positive control)';
  end if;

  reset role;
  raise notice 'PASS 02: owner isolation holds on all five study tables + profiles/prefs';
end;
$probe$;

-- Cross-write attempt: user A inserting a highlight owned by B must fail
-- the WITH CHECK (42501 new-row violation).
do $probe$
declare
  wrote boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    insert into public.highlights (user_id, subtopic_id, anchor, text_snapshot, color)
    values ('00000000-0000-4000-a000-000000000002',
            'f0000000-0000-4000-a000-000000000013',
            '{"v":1,"block_id":"b1","kind":"prose","path":[],"start":0,"end":1,"snapshot":"x"}'::jsonb,
            'x', 'rose');
    wrote := true;
  exception
    when insufficient_privilege then null; -- expected: RLS WITH CHECK rejection
  end;

  reset role;

  if wrote then
    raise exception 'FAIL 02.7: user A inserted a highlight owned by user B';
  end if;
  raise notice 'PASS 02.7: cross-user insert rejected by WITH CHECK';
end;
$probe$;

select 'STUDY OWNER-ISOLATION PROBES PASSED' as status;
