-- RLS probe · 07 — auth_rate_limits lockdown (service-role only)
-- Asserts: anon and authenticated get permission denied on auth_rate_limits
-- for both SELECT and INSERT — privileges are revoked outright, not merely
-- policy-filtered (same archetype as ai_rate_limits, securities §10).
-- Positive control: service_role can insert and update counters.

\set ON_ERROR_STOP on

-- Clean previous run (as postgres) — keeps the probe idempotent.
delete from public.auth_rate_limits
 where identifier = 'rls-probe-hash';

-- Probe 1: anon cannot select auth_rate_limits.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  begin
    select count(*) into n from public.auth_rate_limits;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 07.1: anon could run SELECT on auth_rate_limits (expected permission denied)';
  end if;
  raise notice 'PASS 07.1: anon cannot select auth_rate_limits';
end;
$probe$;

-- Probe 2: anon cannot insert into auth_rate_limits.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  begin
    insert into public.auth_rate_limits (identifier, bucket, window_start, request_count)
    values ('rls-probe-hash', 'signup', now(), 1);
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 07.2: anon could INSERT into auth_rate_limits (expected permission denied)';
  end if;
  raise notice 'PASS 07.2: anon cannot insert into auth_rate_limits';
end;
$probe$;

-- Probe 3: authenticated cannot select auth_rate_limits either.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    select count(*) into n from public.auth_rate_limits;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 07.3: authenticated could run SELECT on auth_rate_limits (expected permission denied)';
  end if;
  raise notice 'PASS 07.3: authenticated cannot select auth_rate_limits';
end;
$probe$;

-- Probe 4: authenticated cannot insert into auth_rate_limits.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    insert into public.auth_rate_limits (identifier, bucket, window_start, request_count)
    values ('rls-probe-hash', 'signin', now(), 1);
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 07.4: authenticated could INSERT into auth_rate_limits (expected permission denied)';
  end if;
  raise notice 'PASS 07.4: authenticated cannot insert into auth_rate_limits';
end;
$probe$;

-- Probe 5: positive control — service_role insert + update succeed (an empty
-- lockdown table must not fake a pass).
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  set local role service_role;

  insert into public.auth_rate_limits (identifier, bucket, window_start, request_count)
  values ('rls-probe-hash', 'signup', date_trunc('hour', now()), 1);

  update public.auth_rate_limits
     set request_count = request_count + 1
   where identifier = 'rls-probe-hash'
     and bucket = 'signup';

  select request_count into n
    from public.auth_rate_limits
   where identifier = 'rls-probe-hash'
     and bucket = 'signup';

  reset role;

  if n is distinct from 2 then
    raise exception 'FAIL 07.5: service_role insert+update did not stick (request_count=%)', n;
  end if;
  raise notice 'PASS 07.5: service_role can insert and update auth_rate_limits';
end;
$probe$;

-- Cleanup (as postgres): drop the probe counter row.
delete from public.auth_rate_limits
 where identifier = 'rls-probe-hash';

select '07 PROBES PASSED' as status;
