-- RLS probe · 06 — waitlist: anon INSERT works, anon SELECT fails
-- (S12 waitlist archetype: insert-only for the public, reads via service
-- role only.)

\set ON_ERROR_STOP on

-- Probe 1: anon can insert a signup (plain INSERT, no RETURNING — matching
-- the landing form's Prefer: return=minimal write).
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  insert into public.waitlist_signups (email, module, role)
  values ('rls-probe@example.com', 'community', 'student');

  reset role;

  -- Verify as postgres (anon has no read path by design).
  select count(*) into n
    from public.waitlist_signups
   where email = 'rls-probe@example.com' and module = 'community';

  if n <> 1 then
    raise exception 'FAIL 06.1: anon waitlist insert did not land';
  end if;
  raise notice 'PASS 06.1: anon can insert a waitlist signup';
end;
$probe$;

-- Probe 2: anon cannot SELECT the waitlist (permission denied — revoked).
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  begin
    select count(*) into n from public.waitlist_signups;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 06.2: anon could SELECT from waitlist_signups';
  end if;
  raise notice 'PASS 06.2: anon cannot select waitlist signups';
end;
$probe$;

-- Probe 3: authenticated cannot SELECT either (no email harvesting).
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    select count(*) into n from public.waitlist_signups;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 06.3: authenticated could SELECT from waitlist_signups';
  end if;
  raise notice 'PASS 06.3: authenticated cannot select waitlist signups';
end;
$probe$;

-- Probe 4: anon cannot DELETE waitlist rows.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  begin
    delete from public.waitlist_signups where email = 'rls-probe@example.com';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 06.4: anon could DELETE from waitlist_signups';
  end if;
  raise notice 'PASS 06.4: anon cannot delete waitlist signups';
end;
$probe$;

-- Cleanup (as postgres).
delete from public.waitlist_signups where email = 'rls-probe@example.com';

select 'WAITLIST PROBES PASSED' as status;
