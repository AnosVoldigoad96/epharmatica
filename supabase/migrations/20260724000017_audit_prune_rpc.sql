-- 017 · Audit retention prune RPC (M4 §9 D-b · migration 008's note)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- audit_log is append-only for EVERY API role (008: update/delete revoked
-- incl. service_role, CI probe 05). The 12-month → yearly-R2-export → prune
-- cycle still needs a delete path; 008 said "a direct owner connection".
-- This owner-owned SECURITY DEFINER function IS that path, callable ONLY
-- by service_role (the cron route, after a successful R2 upload): execute
-- is revoked from anon/authenticated/public, so the append-only posture
-- for interactive roles is unchanged.
create or replace function public.prune_audit_log(p_from timestamptz, p_to timestamptz)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'prune_audit_log: invalid range';
  end if;
  -- Guard: never prune inside the 12-month hot window (D-b).
  if p_to > now() - interval '12 months' then
    raise exception 'prune_audit_log: range reaches into the hot window';
  end if;

  delete from public.audit_log
   where created_at >= p_from and created_at < p_to;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke execute on function public.prune_audit_log(timestamptz, timestamptz) from public;
revoke execute on function public.prune_audit_log(timestamptz, timestamptz) from anon;
revoke execute on function public.prune_audit_log(timestamptz, timestamptz) from authenticated;
grant execute on function public.prune_audit_log(timestamptz, timestamptz) to service_role;

comment on function public.prune_audit_log(timestamptz, timestamptz) is
  'The D-b retention delete path: owner-definer, service_role-only execute, refuses ranges inside the 12-month hot window. Called by the audit-export cron AFTER a successful R2 upload.';
