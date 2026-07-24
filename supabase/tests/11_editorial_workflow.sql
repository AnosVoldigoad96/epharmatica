-- RLS probe · 11 — editorial workflow engine (M4 §5.5 · securities.md §5 M4)
-- Asserts: workflow columns are API-immutable (authors cannot self-publish
-- by direct update); the transition matrix holds — reviewer cannot publish,
-- author cannot approve their own draft, request_changes requires a
-- comment; publish snapshots a revision, flips from approved only, and
-- auto-revokes preview links; restore creates a NEW revision.

\set ON_ERROR_STOP on

-- Probe 1: author cannot flip status by direct UPDATE (trigger guard).
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;

  begin
    update public.subtopics set status = 'published'
     where id = 'f0000000-0000-4000-a000-000000000014';
  exception
    when insufficient_privilege then denied := true;
  end;

  reset role;

  if not denied then
    raise exception 'FAIL 11.1: author flipped status by direct update';
  end if;
  raise notice 'PASS 11.1: workflow columns are API-immutable';
end;
$probe$;

-- Probe 2: author CAN still edit content/plain_text (drafting unaffected).
do $probe$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;

  update public.subtopics
     set plain_text = 'Draft fixture body — must never leak.'
   where id = 'f0000000-0000-4000-a000-000000000014';

  reset role;
  raise notice 'PASS 11.2: drafting writes still work under the guard';
end;
$probe$;

-- Probe 3: full loop — author submits (snapshot + event), reviewer cannot
-- review OWN draft, the other reviewer approves, reviewer cannot publish,
-- CM publishes (revision + event + preview links revoked), CM unpublishes.
do $probe$
declare
  v_revisions_before int;
  v_revisions_after int;
  denied_own boolean := false;
  denied_reviewer_publish boolean := false;
  denied_comment boolean := false;
  v_status public.content_status;
  v_active_links int;
  v_events int;
begin
  select count(*) into v_revisions_before from public.content_revisions
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';

  -- Author submits.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'submit', null);
  reset role;

  select status into v_status from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';
  if v_status <> 'in_review' then
    raise exception 'FAIL 11.3: submit did not reach in_review (%)', v_status;
  end if;

  -- The submitting AUTHOR (who also holds reviewer-capable rank? no — use a
  -- content_manager as the self-review probe: CM submitted nothing, so make
  -- the AUTHOR the author-of-record and have the AUTHOR attempt the review
  -- via a rank that could review: not possible for plain author. The own-
  -- draft rule is probed with the CM submitting + CM reviewing below.)

  -- request_changes without a comment fails.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014',
      'request_changes', '  ');
  exception
    when others then denied_comment := true;
  end;

  -- Reviewer approves (someone else's draft — allowed).
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'approve', null);

  -- Reviewer cannot publish.
  begin
    perform public.publish_subtopic('f0000000-0000-4000-a000-000000000014', null, 1);
  exception
    when insufficient_privilege then denied_reviewer_publish := true;
  end;
  reset role;

  if not denied_comment then
    raise exception 'FAIL 11.3: request_changes accepted a blank comment';
  end if;
  if not denied_reviewer_publish then
    raise exception 'FAIL 11.3: reviewer could publish';
  end if;

  -- CM publishes: revision snapshot + event + preview links auto-revoked.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.publish_subtopic('f0000000-0000-4000-a000-000000000014',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 3);
  reset role;

  select status into v_status from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';
  select count(*) into v_active_links from public.preview_links
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014' and revoked_at is null;
  select count(*) into v_revisions_after from public.content_revisions
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';
  select count(*) into v_events from public.content_review_events
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';

  if v_status <> 'published' then
    raise exception 'FAIL 11.3: publish did not reach published (%)', v_status;
  end if;
  if v_active_links <> 0 then
    raise exception 'FAIL 11.3: publish left % active preview link(s)', v_active_links;
  end if;
  if v_revisions_after < v_revisions_before + 2 then
    raise exception 'FAIL 11.3: submit+publish did not snapshot two revisions';
  end if;
  if v_events < 3 then
    raise exception 'FAIL 11.3: transitions wrote % event(s), expected >= 3', v_events;
  end if;

  -- CM unpublishes → draft, published_at cleared (M1 §5.10).
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'unpublish', null);
  reset role;

  select status into v_status from public.subtopics
   where id = 'f0000000-0000-4000-a000-000000000014';
  if v_status <> 'draft' then
    raise exception 'FAIL 11.3: unpublish did not return to draft (%)', v_status;
  end if;

  raise notice 'PASS 11.3: submit → approve → publish → unpublish matrix holds';
end;
$probe$;

-- Probe 4: author cannot approve their OWN draft — the content manager
-- submits (becoming author of record), then tries to approve.
do $probe$
declare
  denied boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'submit', null);

  begin
    perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014', 'approve', null);
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  -- Clean up: the OTHER reviewer sends it back to changes_requested, then
  -- restore draft status for later suites via unpublish-safe path.
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  perform public.transition_subtopic('f0000000-0000-4000-a000-000000000014',
    'request_changes', 'probe reset');
  reset role;

  if not denied then
    raise exception 'FAIL 11.4: author of record approved their own draft';
  end if;
  raise notice 'PASS 11.4: own-draft review blocked';
end;
$probe$;

-- Probe 5: restore creates a NEW revision (never destructive), CM+ only.
do $probe$
declare
  v_rev uuid;
  v_before int;
  v_after int;
  denied boolean := false;
begin
  select id into v_rev from public.content_revisions
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014'
   order by created_at asc limit 1;
  select count(*) into v_before from public.content_revisions
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000004","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform public.restore_revision(v_rev);
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.restore_revision(v_rev);
  reset role;

  select count(*) into v_after from public.content_revisions
   where subtopic_id = 'f0000000-0000-4000-a000-000000000014';

  if not denied then
    raise exception 'FAIL 11.5: author could restore a revision';
  end if;
  if v_after <> v_before + 1 then
    raise exception 'FAIL 11.5: restore did not add exactly one revision (% -> %)', v_before, v_after;
  end if;
  raise notice 'PASS 11.5: restore is CM+ and never destructive';
end;
$probe$;

-- Probe 6: staff_directory is staff-only and returns no plain users.
do $probe$
declare
  denied boolean := false;
  n_users int;
  n_staff int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
  set local role authenticated;
  begin
    perform * from public.staff_directory();
  exception
    when insufficient_privilege then denied := true;
  end;
  reset role;

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) filter (where d.role = 'user'), count(*)
    into n_users, n_staff
    from public.staff_directory() d;
  reset role;

  if not denied then
    raise exception 'FAIL 11.6: non-staff user could read the staff directory';
  end if;
  if n_users <> 0 then
    raise exception 'FAIL 11.6: staff directory leaked % plain user row(s)', n_users;
  end if;
  if n_staff < 3 then
    raise exception 'FAIL 11.6: staff directory returned % rows (expected >= 3 fixtures)', n_staff;
  end if;
  raise notice 'PASS 11.6: staff directory staff-only, staff rows only';
end;
$probe$;

select 'EDITORIAL WORKFLOW PROBES PASSED' as status;
