-- RLS probe · 03 — ai_keys is RPC-only
-- Asserts: authenticated (even the key's OWNER) and anon get permission
-- denied on ai_keys — privileges are revoked outright, not merely
-- policy-filtered. The encrypted blob never crosses the API (securities §7).

\set ON_ERROR_STOP on

-- Probe 1: the OWNER (user B) cannot select their own ai_keys row.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    select count(*) into n from public.ai_keys;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 03.1: authenticated could run SELECT on ai_keys (expected permission denied)';
  end if;
  raise notice 'PASS 03.1: authenticated (owner) cannot select ai_keys';
end;
$probe$;

-- Probe 2: authenticated cannot insert into ai_keys either.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    insert into public.ai_keys (user_id, provider, storage_mode)
    values ('00000000-0000-4000-a000-000000000001', 'openai', 'device');
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 03.2: authenticated could INSERT into ai_keys (expected permission denied)';
  end if;
  raise notice 'PASS 03.2: authenticated cannot insert into ai_keys';
end;
$probe$;

-- Probe 3: anon gets permission denied too.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  begin
    select count(*) into n from public.ai_keys;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 03.3: anon could run SELECT on ai_keys (expected permission denied)';
  end if;
  raise notice 'PASS 03.3: anon cannot select ai_keys';
end;
$probe$;

-- Probe 4: ai_rate_limits is equally unreachable from API roles.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    select count(*) into n from public.ai_rate_limits;
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 03.4: authenticated could read ai_rate_limits (expected permission denied)';
  end if;
  raise notice 'PASS 03.4: authenticated cannot read ai_rate_limits';
end;
$probe$;

select 'AI-KEYS LOCKDOWN PROBES PASSED' as status;
