-- RLS probe · 09 — media library + review claims (M4-2 / M4-3 · securities.md §5 M4)
-- Asserts: media_assets public read excludes soft-deleted rows; writes are
-- staff-only; alt text is required at the constraint level; media_refs are
-- read-only for API roles and RESTRICT hard deletes of referenced assets;
-- review claims collide at the DB and release paths respect roles.

\set ON_ERROR_STOP on

-- Probe 1: anon sees live assets but never soft-deleted ones.
do $probe$
declare
  n_live int;
  n_deleted int;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;

  select count(*) into n_live from public.media_assets
   where path like 'rls-probe/%';
  select count(*) into n_deleted from public.media_assets
   where id = 'f0000000-0000-4000-a000-000000000032';

  reset role;

  if n_live <> 2 then
    raise exception 'FAIL 09.1: anon sees % live probe assets (expected 2)', n_live;
  end if;
  if n_deleted <> 0 then
    raise exception 'FAIL 09.1: anon can see the soft-deleted asset';
  end if;
  raise notice 'PASS 09.1: public read excludes soft-deleted assets';
end;
$probe$;

-- Probe 2: staff (author) sees soft-deleted assets too (the undo surface).
do $probe$
declare
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.media_assets
   where path like 'rls-probe/%';

  reset role;

  if n <> 3 then
    raise exception 'FAIL 09.2: author sees % probe assets (expected 3 incl. deleted)', n;
  end if;
  raise notice 'PASS 09.2: staff read includes soft-deleted assets';
end;
$probe$;

-- Probe 3: non-staff cannot write media_assets; author can (positive control).
do $probe$
declare
  denied_insert boolean := false;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;

  begin
    insert into public.media_assets (path, alt, width, height, bytes)
    values ('rls-probe/illegal.webp', 'Illegal insert', 1, 1, 1);
  exception
    when insufficient_privilege then denied_insert := true;
  end;

  update public.media_assets set alt = 'tampered'
   where id = 'f0000000-0000-4000-a000-000000000030';

  reset role;

  if not denied_insert then
    raise exception 'FAIL 09.3: non-staff user could INSERT into media_assets';
  end if;

  select count(*) into n from public.media_assets
   where id = 'f0000000-0000-4000-a000-000000000030' and alt = 'tampered';
  if n <> 0 then
    raise exception 'FAIL 09.3: non-staff user could UPDATE media_assets';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;

  insert into public.media_assets (path, alt, width, height, bytes, uploaded_by)
  values ('rls-probe/temp.webp', 'Author upload probe', 10, 10, 10,
          '00000000-0000-4000-a000-000000000004');

  reset role;

  delete from public.media_assets where path = 'rls-probe/temp.webp';

  raise notice 'PASS 09.3: media writes staff-only (author positive control)';
end;
$probe$;

-- Probe 4: alt text is required at the constraint level — no alt, no save.
do $probe$
declare
  denied boolean := false;
begin
  begin
    insert into public.media_assets (path, alt, width, height, bytes)
    values ('rls-probe/no-alt.webp', '   ', 1, 1, 1);
  exception
    when check_violation then denied := true;
  end;

  if not denied then
    raise exception 'FAIL 09.4: blank alt text was accepted';
  end if;
  raise notice 'PASS 09.4: alt-required enforced by CHECK constraint';
end;
$probe$;

-- Probe 5: media_refs — staff read, no API-role writes, anon blind.
do $probe$
declare
  n int;
  denied boolean := false;
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into n from public.media_refs;
  reset role;
  if n <> 0 then
    raise exception 'FAIL 09.5: anon can select % media_refs row(s)', n;
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  select count(*) into n from public.media_refs
   where asset_id = 'f0000000-0000-4000-a000-000000000030';

  begin
    insert into public.media_refs (subtopic_id, asset_id, source)
    values ('f0000000-0000-4000-a000-000000000013',
            'f0000000-0000-4000-a000-000000000031', 'draft');
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if n < 1 then
    raise exception 'FAIL 09.5: content manager cannot read media_refs (positive control)';
  end if;
  if not denied then
    raise exception 'FAIL 09.5: content manager could INSERT media_refs (service-role only)';
  end if;
  raise notice 'PASS 09.5: media_refs staff-read, API writes denied';
end;
$probe$;

-- Probe 6: hard-deleting a referenced asset fails even for service_role
-- (FK RESTRICT — the delete-block cannot be bypassed above RLS).
do $probe$
declare
  denied boolean := false;
begin
  set local role service_role;

  begin
    delete from public.media_assets
     where id = 'f0000000-0000-4000-a000-000000000030';
  exception
    when foreign_key_violation then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 09.6: referenced asset was hard-deleted';
  end if;
  raise notice 'PASS 09.6: referenced assets cannot be hard-deleted';
end;
$probe$;

-- Probe 7: review claims — reviewer claims for self; collision blocked at
-- the DB; non-staff and impersonated claims denied.
do $probe$
declare
  denied_user boolean := false;
  denied_impersonation boolean := false;
  collided boolean := false;
begin
  -- Non-staff cannot claim.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.review_claims (subtopic_id, reviewer_id)
    values ('f0000000-0000-4000-a000-000000000014',
            '00000000-0000-4000-a000-000000000001');
  exception
    when insufficient_privilege then denied_user := true;
  end;
  reset role;

  -- Reviewer cannot claim in someone else's name.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.review_claims (subtopic_id, reviewer_id)
    values ('f0000000-0000-4000-a000-000000000014',
            '00000000-0000-4000-a000-000000000006');
  exception
    when insufficient_privilege then denied_impersonation := true;
  end;

  -- Reviewer claims for self (positive control).
  insert into public.review_claims (subtopic_id, reviewer_id)
  values ('f0000000-0000-4000-a000-000000000014',
          '00000000-0000-4000-a000-000000000005');
  reset role;

  -- Second active claim on the same subtopic collides (partial unique index).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.review_claims (subtopic_id, reviewer_id)
    values ('f0000000-0000-4000-a000-000000000014',
            '00000000-0000-4000-a000-000000000006');
  exception
    when unique_violation then collided := true;
  end;
  reset role;

  delete from public.review_claims
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';

  if not denied_user then
    raise exception 'FAIL 09.7: non-staff user could claim a review';
  end if;
  if not denied_impersonation then
    raise exception 'FAIL 09.7: reviewer could claim in another reviewer''s name';
  end if;
  if not collided then
    raise exception 'FAIL 09.7: second active claim did not collide';
  end if;
  raise notice 'PASS 09.7: claim semantics — self-only, one active per subtopic';
end;
$probe$;

-- Probe 8: release paths — reviewer cannot release another reviewer's claim
-- (row invisible to UPDATE under RLS); content_manager can.
do $probe$
declare
  v_claim_id uuid;
  n int;
begin
  insert into public.review_claims (subtopic_id, reviewer_id)
  values ('f0000000-0000-4000-a000-000000000014',
          '00000000-0000-4000-a000-000000000006')
  returning id into v_claim_id;

  -- Reviewer (not the claimant, not CM+) tries to release: 0 rows touched.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  update public.review_claims set released_at = now() where id = v_claim_id;
  reset role;

  select count(*) into n from public.review_claims
   where id = v_claim_id and released_at is null;
  if n <> 1 then
    raise exception 'FAIL 09.8: reviewer released another reviewer''s claim';
  end if;

  -- Content manager releases it (M4 §5.6: others by content_manager+).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  update public.review_claims set released_at = now() where id = v_claim_id;
  reset role;

  select count(*) into n from public.review_claims
   where id = v_claim_id and released_at is not null;

  delete from public.review_claims where id = v_claim_id;

  if n <> 1 then
    raise exception 'FAIL 09.8: content manager could not release the claim';
  end if;
  raise notice 'PASS 09.8: release paths respect roles';
end;
$probe$;

select 'MEDIA + REVIEW-CLAIM PROBES PASSED' as status;
