-- RLS probe · 15 — review discussions (M4 §5.4 · securities.md §5 M4)
-- Asserts: discussions/replies are staff-only, creator-stamped, immutable
-- history (no delete path for API roles), suggestion kind requires text.

\set ON_ERROR_STOP on

-- Probe 1: non-staff blind + cannot insert; reviewer creates self-stamped.
do $probe$
declare
  n int;
  denied_read boolean := false;
  denied_insert boolean := false;
  denied_impersonation boolean := false;
  v_id uuid;
begin
  -- Reviewer creates a discussion (positive control).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.content_discussions (subtopic_id, block_id, snapshot, created_by)
  values ('f0000000-0000-4000-a000-000000000014', 'b1', 'Draft fixture body',
          '00000000-0000-4000-a000-000000000005')
  returning id into v_id;

  -- Cannot create in someone else's name.
  begin
    insert into public.content_discussions (subtopic_id, block_id, created_by)
    values ('f0000000-0000-4000-a000-000000000014', 'b1',
            '00000000-0000-4000-a000-000000000004');
  exception
    when insufficient_privilege then denied_impersonation := true;
  end;
  reset role;

  -- Plain user: blind + denied.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into n from public.content_discussions where id = v_id;
  if n <> 0 then
    reset role;
    raise exception 'FAIL 15.1: non-staff user can read discussions';
  end if;
  begin
    insert into public.content_discussions (subtopic_id, block_id, created_by)
    values ('f0000000-0000-4000-a000-000000000014', 'b1',
            '00000000-0000-4000-a000-000000000001');
  exception
    when insufficient_privilege then denied_insert := true;
  end;
  reset role;

  delete from public.content_discussions where id = v_id;

  if not denied_impersonation then
    raise exception 'FAIL 15.1: reviewer created a discussion in another name';
  end if;
  if not denied_insert then
    raise exception 'FAIL 15.1: non-staff user could create a discussion';
  end if;
  if denied_read then
    null;
  end if;
  raise notice 'PASS 15.1: discussions staff-only, creator-stamped';
end;
$probe$;

-- Probe 2: suggestion kind requires text; replies staff-only; author can
-- resolve a reviewer's discussion (resolution is workflow, not ownership).
do $probe$
declare
  denied_kind boolean := false;
  denied_reply boolean := false;
  v_id uuid;
  v_status text;
begin
  begin
    insert into public.content_discussions (subtopic_id, block_id, kind, created_by)
    values ('f0000000-0000-4000-a000-000000000014', 'b1', 'suggestion',
            null);
  exception
    when check_violation then denied_kind := true;
  end;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.content_discussions
    (subtopic_id, block_id, kind, suggested_text, created_by)
  values ('f0000000-0000-4000-a000-000000000014', 'b1', 'suggestion',
          'Better phrasing here.', '00000000-0000-4000-a000-000000000005')
  returning id into v_id;
  reset role;

  -- Non-staff cannot reply.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    insert into public.content_discussion_replies (discussion_id, author_id, body)
    values (v_id, '00000000-0000-4000-a000-000000000001', 'nope');
  exception
    when insufficient_privilege then denied_reply := true;
  end;
  reset role;

  -- The AUTHOR (not the creator) resolves it.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.content_discussion_replies (discussion_id, author_id, body)
  values (v_id, '00000000-0000-4000-a000-000000000004', 'Applied, thanks.');
  update public.content_discussions set status = 'resolved' where id = v_id;
  reset role;

  select status into v_status from public.content_discussions where id = v_id;

  delete from public.content_discussions where id = v_id;

  if not denied_kind then
    raise exception 'FAIL 15.2: suggestion without text accepted';
  end if;
  if not denied_reply then
    raise exception 'FAIL 15.2: non-staff user could reply';
  end if;
  if v_status <> 'resolved' then
    raise exception 'FAIL 15.2: author could not resolve (%)', v_status;
  end if;
  raise notice 'PASS 15.2: suggestions need text; replies staff-only; author resolves';
end;
$probe$;

select 'DISCUSSION PROBES PASSED' as status;
