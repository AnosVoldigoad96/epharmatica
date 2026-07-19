-- RLS probe · 05 — audit_log is append-only for EVERY API role
-- Asserts: update/delete are revoked from authenticated (even with the
-- admin application role) AND from service_role; admin+ can still read.

\set ON_ERROR_STOP on

-- Probe 1: authenticated with admin application role can READ the audit log.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.audit_log where action = 'rls_probe';

  reset role;

  if n < 1 then
    raise exception 'FAIL 05.1: admin cannot read audit_log (positive control)';
  end if;
  raise notice 'PASS 05.1: admin role reads audit_log';
end;
$probe$;

-- Probe 2: authenticated (admin application role) cannot UPDATE audit rows.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.audit_log set action = 'tampered' where action = 'rls_probe';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 05.2: authenticated could UPDATE audit_log';
  end if;
  raise notice 'PASS 05.2: audit_log UPDATE denied for authenticated';
end;
$probe$;

-- Probe 3: authenticated cannot DELETE audit rows.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;

  begin
    delete from public.audit_log where action = 'rls_probe';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 05.3: authenticated could DELETE from audit_log';
  end if;
  raise notice 'PASS 05.3: audit_log DELETE denied for authenticated';
end;
$probe$;

-- Probe 4: even service_role cannot UPDATE (append-only means no role via
-- the API can mutate history — rules.md §12.3).
do $probe$
declare
  denied boolean := false;
begin
  set local role service_role;

  begin
    update public.audit_log set action = 'tampered' where action = 'rls_probe';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 05.4: service_role could UPDATE audit_log';
  end if;
  raise notice 'PASS 05.4: audit_log UPDATE denied for service_role';
end;
$probe$;

-- Probe 5: service_role cannot DELETE either.
do $probe$
declare
  denied boolean := false;
begin
  set local role service_role;

  begin
    delete from public.audit_log where action = 'rls_probe';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 05.5: service_role could DELETE from audit_log';
  end if;
  raise notice 'PASS 05.5: audit_log DELETE denied for service_role';
end;
$probe$;

-- Probe 6: the probe row is still intact and unmodified.
do $probe$
declare
  n int;
begin
  select count(*) into n from public.audit_log where action = 'rls_probe';
  if n < 1 then
    raise exception 'FAIL 05.6: audit probe row vanished';
  end if;
  raise notice 'PASS 05.6: audit rows immutable end-to-end';
end;
$probe$;

select 'AUDIT-LOG APPEND-ONLY PROBES PASSED' as status;
