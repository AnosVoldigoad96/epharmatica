-- RLS probe · 14 — prune_audit_log (M4 §9 D-b · securities.md §5 M4)
-- Asserts: the retention delete path is service_role-only; anon and
-- authenticated (even admin) cannot execute; the hot-window guard refuses
-- ranges newer than 12 months; a legal aged prune deletes.

\set ON_ERROR_STOP on

-- Probe 1: anon and authenticated (admin) cannot execute.
do $probe$
declare
  denied_anon boolean := false;
  denied_admin boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin
    perform public.prune_audit_log(now() - interval '3 years', now() - interval '2 years');
  exception
    when insufficient_privilege then denied_anon := true;
  end;
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.prune_audit_log(now() - interval '3 years', now() - interval '2 years');
  exception
    when insufficient_privilege then denied_admin := true;
  end;
  reset role;

  if not denied_anon then
    raise exception 'FAIL 14.1: anon could execute prune_audit_log';
  end if;
  if not denied_admin then
    raise exception 'FAIL 14.1: authenticated admin could execute prune_audit_log';
  end if;
  raise notice 'PASS 14.1: prune execute denied to interactive roles';
end;
$probe$;

-- Probe 2: hot-window guard + a legal aged prune (service_role).
do $probe$
declare
  refused boolean := false;
  v_deleted int;
begin
  -- Seed one aged row (as postgres — inserts are owner/service territory).
  insert into public.audit_log (actor_id, action, entity, entity_id, meta, created_at)
  values (null, 'rls_probe_aged', 'test', 'aged', '{}'::jsonb, now() - interval '30 months');

  set local role service_role;

  begin
    perform public.prune_audit_log(now() - interval '2 months', now() - interval '1 month');
  exception
    when others then refused := true;
  end;

  select public.prune_audit_log(now() - interval '3 years', now() - interval '2 years')
    into v_deleted;

  reset role;

  if not refused then
    raise exception 'FAIL 14.2: prune accepted a range inside the hot window';
  end if;
  if v_deleted < 1 then
    raise exception 'FAIL 14.2: aged prune deleted % rows (expected >= 1)', v_deleted;
  end if;
  raise notice 'PASS 14.2: hot-window guarded; aged prune works for service_role';
end;
$probe$;

select 'AUDIT-PRUNE PROBES PASSED' as status;
