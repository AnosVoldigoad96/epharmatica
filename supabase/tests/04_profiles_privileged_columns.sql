-- RLS probe · 04 — profiles privileged-column guard (M2 §7 trigger)
-- Asserts: an owner CAN update ordinary fields, but CANNOT change role,
-- is_verified_pharmacist, or clear deletion_requested_at. The guard raises
-- 42501 from the BEFORE UPDATE trigger for anon/authenticated.

\set ON_ERROR_STOP on

-- Precondition (as postgres): give user B a pending deletion flag to probe
-- against. Runs before any role switch — service-side writes are allowed.
update public.profiles
   set deletion_requested_at = now()
 where id = '00000000-0000-4000-a000-000000000002';

-- Probe 1: positive control — owner updates display_name successfully.
do $probe$
declare
  v text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  update public.profiles
     set display_name = 'RLS User B (edited)'
   where id = '00000000-0000-4000-a000-000000000002';

  select display_name into v
    from public.profiles
   where id = '00000000-0000-4000-a000-000000000002';

  reset role;

  if v is distinct from 'RLS User B (edited)' then
    raise exception 'FAIL 04.1: owner could not update an ordinary profile field';
  end if;
  raise notice 'PASS 04.1: owner can update ordinary profile fields';
end;
$probe$;

-- Probe 2: owner cannot self-elevate role.
do $probe$
declare
  blocked boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.profiles
       set role = 'admin'
     where id = '00000000-0000-4000-a000-000000000002';
  exception
    when insufficient_privilege then blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception 'FAIL 04.2: user self-elevated profiles.role to admin';
  end if;
  raise notice 'PASS 04.2: role self-elevation blocked by trigger';
end;
$probe$;

-- Probe 3: owner cannot self-set is_verified_pharmacist.
do $probe$
declare
  blocked boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.profiles
       set is_verified_pharmacist = true
     where id = '00000000-0000-4000-a000-000000000002';
  exception
    when insufficient_privilege then blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception 'FAIL 04.3: user self-set is_verified_pharmacist';
  end if;
  raise notice 'PASS 04.3: is_verified_pharmacist self-set blocked by trigger';
end;
$probe$;

-- Probe 4: owner cannot clear their own deletion_requested_at (grace-period
-- cancel goes through the sign-in flow, service-side).
do $probe$
declare
  blocked boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.profiles
       set deletion_requested_at = null
     where id = '00000000-0000-4000-a000-000000000002';
  exception
    when insufficient_privilege then blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception 'FAIL 04.4: user cleared their own deletion_requested_at';
  end if;
  raise notice 'PASS 04.4: deletion_requested_at clearing blocked by trigger';
end;
$probe$;

-- Probe 5: username is immutable for the owner (M2-1).
do $probe$
declare
  blocked boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.profiles
       set username = 'rls-user-b2'
     where id = '00000000-0000-4000-a000-000000000002';
  exception
    when insufficient_privilege then blocked := true;
  end;

  reset role;

  if not blocked then
    raise exception 'FAIL 04.5: user changed their immutable username';
  end if;
  raise notice 'PASS 04.5: username change blocked by trigger';
end;
$probe$;

-- Cleanup (as postgres): clear the probe deletion flag.
update public.profiles
   set deletion_requested_at = null
 where id = '00000000-0000-4000-a000-000000000002';

select 'PROFILES PRIVILEGED-COLUMN PROBES PASSED' as status;
