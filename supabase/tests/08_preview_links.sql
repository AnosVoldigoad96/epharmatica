-- RLS probe · 08 — preview links (M4-4 · securities.md §5 M4)
-- Asserts: the preview_links table is invisible to anon and non-staff; the
-- anon path is ONLY the open_preview_link RPC, which honors expiry and
-- revocation, logs opens, and enforces the 30 opens/hr/IP cap in-function;
-- the opens log is append-only for every API role.

\set ON_ERROR_STOP on

-- Probe 1: anon cannot select preview_links (positive control as postgres).
do $probe$
declare
  n int;
begin
  select count(*) into n from public.preview_links
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';
  if n < 3 then
    raise exception 'FAIL 08.1: fixture preview links missing (positive control)';
  end if;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select count(*) into n from public.preview_links;

  reset role;

  if n <> 0 then
    raise exception 'FAIL 08.1: anon can select % preview_links row(s)', n;
  end if;
  raise notice 'PASS 08.1: preview_links invisible to anon';
end;
$probe$;

-- Probe 2: a plain authenticated user cannot select preview_links.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.preview_links;

  reset role;

  if n <> 0 then
    raise exception 'FAIL 08.2: non-staff user can select % preview_links row(s)', n;
  end if;
  raise notice 'PASS 08.2: preview_links invisible to non-staff';
end;
$probe$;

-- Probe 3: reviewer can read preview links (queue shows link state).
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.preview_links
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';

  reset role;

  if n < 3 then
    raise exception 'FAIL 08.3: reviewer sees % of 3 fixture links', n;
  end if;
  raise notice 'PASS 08.3: staff (reviewer) reads preview_links';
end;
$probe$;

-- Probe 4: non-staff cannot create links; author can (then cleaned up).
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    insert into public.preview_links (subtopic_id, token_hash)
    values ('f0000000-0000-4000-a000-000000000014',
            encode(extensions.digest('rls-probe-illegal-token', 'sha256'), 'hex'));
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 08.4: non-staff user could INSERT a preview link';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;

  insert into public.preview_links (subtopic_id, token_hash, created_by)
  values ('f0000000-0000-4000-a000-000000000014',
          encode(extensions.digest('rls-probe-temp-token', 'sha256'), 'hex'),
          '00000000-0000-4000-a000-000000000004');

  reset role;

  delete from public.preview_links
   where token_hash = encode(extensions.digest('rls-probe-temp-token', 'sha256'), 'hex');

  raise notice 'PASS 08.4: link creation staff-only (author positive control)';
end;
$probe$;

-- Probe 5: RPC with a valid token returns the draft payload and logs the open.
do $probe$
declare
  v_result jsonb;
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select public.open_preview_link('rls-probe-preview-token', 'rls-probe-open-ip', 'probe-ua')
    into v_result;

  reset role;

  if v_result is null then
    raise exception 'FAIL 08.5: RPC returned null for a valid token';
  end if;
  if v_result ->> 'title' <> 'Draft Probe Subtopic' then
    raise exception 'FAIL 08.5: RPC returned wrong subtopic payload (%)', v_result ->> 'title';
  end if;

  select count(*) into n
    from public.preview_link_opens
   where link_id = 'f0000000-0000-4000-a000-000000000020'
     and ip_hash = 'rls-probe-open-ip';

  if n < 1 then
    raise exception 'FAIL 08.5: open was not logged to preview_link_opens';
  end if;
  raise notice 'PASS 08.5: valid token opens the draft and logs the open';
end;
$probe$;

-- Probe 6: expired, revoked, and unknown tokens all return null (one neutral
-- outcome — the response never distinguishes which failed).
do $probe$
declare
  v_expired jsonb;
  v_revoked jsonb;
  v_unknown jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select public.open_preview_link('rls-probe-expired-token', 'rls-probe-open-ip', 'probe-ua')
    into v_expired;
  select public.open_preview_link('rls-probe-revoked-token', 'rls-probe-open-ip', 'probe-ua')
    into v_revoked;
  select public.open_preview_link('rls-probe-no-such-token', 'rls-probe-open-ip', 'probe-ua')
    into v_unknown;

  reset role;

  if v_expired is not null then
    raise exception 'FAIL 08.6: RPC honored an EXPIRED token';
  end if;
  if v_revoked is not null then
    raise exception 'FAIL 08.6: RPC honored a REVOKED token';
  end if;
  if v_unknown is not null then
    raise exception 'FAIL 08.6: RPC returned payload for an unknown token';
  end if;
  raise notice 'PASS 08.6: expired / revoked / unknown tokens all rejected';
end;
$probe$;

-- Probe 7: 30 opens/hr/IP cap — the 31st open from one IP is refused.
do $probe$
declare
  v_result jsonb;
begin
  insert into public.preview_link_opens (link_id, ip_hash, ua)
  select 'f0000000-0000-4000-a000-000000000020', 'rls-probe-capped-ip', 'probe-ua'
    from generate_series(1, 30);

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select public.open_preview_link('rls-probe-preview-token', 'rls-probe-capped-ip', 'probe-ua')
    into v_result;

  reset role;

  delete from public.preview_link_opens where ip_hash = 'rls-probe-capped-ip';

  if v_result is not null then
    raise exception 'FAIL 08.7: 31st open in the hour was served (cap not enforced)';
  end if;
  raise notice 'PASS 08.7: 30 opens/hr/IP cap enforced in the RPC';
end;
$probe$;

-- Probe 8: the opens log is staff-read, invisible to anon and non-staff.
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.preview_link_opens;
  reset role;
  if n <> 0 then
    raise exception 'FAIL 08.8: anon can select % preview_link_opens row(s)', n;
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.preview_link_opens;
  reset role;
  if n <> 0 then
    raise exception 'FAIL 08.8: non-staff user can select % preview_link_opens row(s)', n;
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.preview_link_opens
   where link_id = 'f0000000-0000-4000-a000-000000000020';
  reset role;
  if n < 1 then
    raise exception 'FAIL 08.8: author cannot read the opens log (positive control)';
  end if;
  raise notice 'PASS 08.8: opens log staff-read only';
end;
$probe$;

-- Probe 9: the opens log is append-only for every API role (like audit_log).
do $probe$
declare
  denied_update boolean := false;
  denied_delete boolean := false;
begin
  set local role service_role;

  begin
    update public.preview_link_opens set ua = 'tampered'
     where link_id = 'f0000000-0000-4000-a000-000000000020';
  exception
    when insufficient_privilege then denied_update := true;
  end;

  begin
    delete from public.preview_link_opens
     where link_id = 'f0000000-0000-4000-a000-000000000020';
  exception
    when insufficient_privilege then denied_delete := true;
  end;

  reset role;

  if not denied_update then
    raise exception 'FAIL 08.9: service_role could UPDATE preview_link_opens';
  end if;
  if not denied_delete then
    raise exception 'FAIL 08.9: service_role could DELETE from preview_link_opens';
  end if;
  raise notice 'PASS 08.9: opens log append-only for service_role';
end;
$probe$;

select 'PREVIEW-LINK PROBES PASSED' as status;
