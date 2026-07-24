-- RLS probe · 13 — users administration (M4 §7 · securities.md §5 M4)
-- Asserts: search is admin+; role assignment respects the rank rules
-- (self-elevation and peer-elevation both fail); super_admin may grant
-- super_admin; force-rename quarantines the old handle atomically.

\set ON_ERROR_STOP on

-- Probe 1: search — CM denied, admin sees rows with emails.
do $probe$
declare
  denied boolean := false;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform * from public.admin_search_users('rls');
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;
  if not denied then
    raise exception 'FAIL 13.1: content_manager could search users';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.admin_search_users('rls-user-a')
   where email = 'rls-user-a@example.com';
  reset role;
  if n <> 1 then
    raise exception 'FAIL 13.1: admin search did not find the fixture by email join';
  end if;
  raise notice 'PASS 13.1: user search admin-gated with email visibility';
end;
$probe$;

-- Probe 2: rank rules — self-elevation, peer-touch, and over-grant all fail;
-- a legal grant works; super_admin grants super_admin.
do $probe$
declare
  denied_self boolean := false;
  denied_peer boolean := false;
  denied_over boolean := false;
  v_role public.app_role;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;

  begin
    perform public.admin_set_role('00000000-0000-4000-a000-000000000003', 'super_admin');
  exception
    when insufficient_privilege then denied_self := true;
  end;

  begin
    perform public.admin_set_role('00000000-0000-4000-a000-000000000007', 'user');
  exception
    when insufficient_privilege then denied_peer := true;
  end;

  begin
    perform public.admin_set_role('00000000-0000-4000-a000-000000000001', 'super_admin');
  exception
    when insufficient_privilege then denied_over := true;
  end;

  -- Legal: admin grants author to a plain user.
  perform public.admin_set_role('00000000-0000-4000-a000-000000000001', 'author');
  reset role;

  select role into v_role from public.profiles
   where id = '00000000-0000-4000-a000-000000000001';
  if v_role <> 'author' then
    raise exception 'FAIL 13.2: legal grant did not apply (%)', v_role;
  end if;

  -- super_admin grants super_admin (typed confirmation is UI-side).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000007","role":"authenticated"}', true);
  set local role authenticated;
  perform public.admin_set_role('00000000-0000-4000-a000-000000000001', 'super_admin');
  reset role;

  select role into v_role from public.profiles
   where id = '00000000-0000-4000-a000-000000000001';

  -- Reset the fixture.
  update public.profiles set role = 'user'
   where id = '00000000-0000-4000-a000-000000000001';

  if not denied_self then
    raise exception 'FAIL 13.2: admin self-elevation succeeded';
  end if;
  if not denied_peer then
    raise exception 'FAIL 13.2: admin modified a higher-ranked user';
  end if;
  if not denied_over then
    raise exception 'FAIL 13.2: admin granted super_admin';
  end if;
  if v_role <> 'super_admin' then
    raise exception 'FAIL 13.2: super_admin could not grant super_admin (%)', v_role;
  end if;
  raise notice 'PASS 13.2: rank rules hold; super_admin path works';
end;
$probe$;

-- Probe 3: force-rename — quarantine written, username updated, admin+ only.
do $probe$
declare
  denied boolean := false;
  v_old text;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.admin_force_rename('00000000-0000-4000-a000-000000000002', 'rls-renamed');
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;
  if not denied then
    raise exception 'FAIL 13.3: content_manager could force-rename';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
  set local role authenticated;
  select public.admin_force_rename('00000000-0000-4000-a000-000000000002', 'rls-renamed')
    into v_old;
  reset role;

  select count(*) into n from public.handle_quarantine
   where handle = 'rls-user-b' and freed_after > now();

  -- Reset fixture (postgres bypasses the guard trigger).
  update public.profiles set username = 'rls-user-b'
   where id = '00000000-0000-4000-a000-000000000002';
  delete from public.handle_quarantine where handle = 'rls-user-b';

  if v_old <> 'rls-user-b' then
    raise exception 'FAIL 13.3: rename returned wrong old handle (%)', v_old;
  end if;
  if n <> 1 then
    raise exception 'FAIL 13.3: 90-day quarantine row missing';
  end if;
  raise notice 'PASS 13.3: force-rename quarantines and applies atomically';
end;
$probe$;

-- Probe 4: site_settings — public read, admin-only write.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.site_settings where key = 'site.title';
  reset role;
  if n <> 1 then
    raise exception 'FAIL 13.4: anon cannot read site settings';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  begin
    update public.site_settings set value = '"tampered"'::jsonb where key = 'site.title';
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  select count(*) into n from public.site_settings
   where key = 'site.title' and value = '"tampered"'::jsonb;
  if n <> 0 then
    raise exception 'FAIL 13.4: content_manager tampered with site settings';
  end if;
  raise notice 'PASS 13.4: site settings public-read, admin-write';
end;
$probe$;

select 'USERS-ADMIN PROBES PASSED' as status;
