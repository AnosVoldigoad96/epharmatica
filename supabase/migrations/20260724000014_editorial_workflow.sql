-- 014 · Editorial workflow engine (M4 §5.5 · M1 §5.10 · securities.md §5 M4)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- The RLS staff_write policy lets authors update subtopic rows for
-- drafting — which would include `status`. The workflow role matrix
-- (authors submit; reviewers approve/request changes, never their own
-- draft; content managers publish/unpublish/archive) must hold at the DB,
-- so: a BEFORE UPDATE trigger freezes the workflow columns for API roles
-- (the profiles privileged-columns pattern), and every transition runs
-- through the SECURITY DEFINER RPCs below — role matrix inside, revision
-- snapshot + review event + status flip in ONE transaction.

-- ---------------------------------------------------------------------------
-- Workflow columns are API-immutable (trigger guard)
-- ---------------------------------------------------------------------------
create or replace function public.subtopics_guard_workflow_columns()
returns trigger
language plpgsql
as $$
begin
  -- current_user is 'anon'/'authenticated' for direct API writes; definer
  -- functions and the service role pass through.
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from old.status
       or new.published_at is distinct from old.published_at
       or new.primary_video_url is distinct from old.primary_video_url
       or new.reading_minutes is distinct from old.reading_minutes then
      raise exception 'workflow columns change only through the workflow RPCs'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger subtopics_guard_workflow_columns
  before update on public.subtopics
  for each row execute function public.subtopics_guard_workflow_columns();

-- ---------------------------------------------------------------------------
-- Author of record: the editor of the latest revision snapshot
-- ---------------------------------------------------------------------------
-- "Author cannot approve own draft" (M4 §12, CI-enforced) needs an author
-- of record: the most recent revision's editor_id (submit and publish both
-- snapshot, so this is whoever last submitted the content for review).
create or replace function public._subtopic_author_of_record(p_subtopic_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.editor_id
    from public.content_revisions r
   where r.subtopic_id = p_subtopic_id
   order by r.created_at desc
   limit 1
$$;

comment on function public._subtopic_author_of_record(uuid) is
  'Internal: editor_id of the latest revision snapshot — the "own draft" check for review decisions.';

-- ---------------------------------------------------------------------------
-- transition_subtopic — submit / approve / request_changes / unpublish / archive
-- ---------------------------------------------------------------------------
-- publish has its own RPC below (it carries derived fields). Matrix
-- (M4 §5.5): submit = author+ from draft|changes_requested, snapshots a
-- revision; approve / request_changes = reviewer+ from in_review, never on
-- your own draft, request_changes REQUIRES a comment, both auto-release
-- the claim; unpublish = content_manager+ from published → draft (M1 §5.10
-- — the unit is being revised); archive = content_manager+ from any
-- non-archived state. Every transition writes content_review_events.
create or replace function public.transition_subtopic(
  p_subtopic_id uuid,
  p_action text,
  p_comment text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.content_status;
  v_content jsonb;
  v_actor uuid := auth.uid();
  v_to public.content_status;
begin
  select s.status, s.content into v_status, v_content
    from public.subtopics s where s.id = p_subtopic_id for update;
  if not found then
    raise exception 'transition_subtopic: subtopic % not found', p_subtopic_id;
  end if;

  if p_action = 'submit' then
    if not public.has_role(array['author', 'content_manager', 'admin', 'super_admin']) then
      raise exception 'transition_subtopic: author role required' using errcode = '42501';
    end if;
    if v_status not in ('draft', 'changes_requested') then
      raise exception 'transition_subtopic: cannot submit from %', v_status;
    end if;
    insert into public.content_revisions (subtopic_id, content, editor_id, note)
    values (p_subtopic_id, v_content, v_actor, 'submit');
    v_to := 'in_review';

  elsif p_action in ('approve', 'request_changes') then
    if not public.has_role(array['reviewer', 'content_manager', 'admin', 'super_admin']) then
      raise exception 'transition_subtopic: reviewer role required' using errcode = '42501';
    end if;
    if v_status <> 'in_review' then
      raise exception 'transition_subtopic: cannot review from %', v_status;
    end if;
    if public._subtopic_author_of_record(p_subtopic_id) = v_actor then
      raise exception 'transition_subtopic: cannot review your own draft'
        using errcode = '42501';
    end if;
    if p_action = 'request_changes' and (p_comment is null or btrim(p_comment) = '') then
      raise exception 'transition_subtopic: request_changes requires a comment';
    end if;
    v_to := case when p_action = 'approve' then 'approved' else 'changes_requested' end;
    -- Approve / request-changes auto-release the claim (M4 §5.6).
    update public.review_claims
       set released_at = now()
     where subtopic_id = p_subtopic_id and released_at is null;

  elsif p_action = 'unpublish' then
    if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
      raise exception 'transition_subtopic: content_manager role required'
        using errcode = '42501';
    end if;
    if v_status <> 'published' then
      raise exception 'transition_subtopic: cannot unpublish from %', v_status;
    end if;
    v_to := 'draft';

  elsif p_action = 'archive' then
    if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
      raise exception 'transition_subtopic: content_manager role required'
        using errcode = '42501';
    end if;
    if v_status = 'archived' then
      raise exception 'transition_subtopic: already archived';
    end if;
    v_to := 'archived';

  else
    raise exception 'transition_subtopic: unknown action %', p_action;
  end if;

  update public.subtopics
     set status = v_to,
         published_at = case when p_action = 'unpublish' then null else published_at end
   where id = p_subtopic_id;

  insert into public.content_review_events (subtopic_id, from_status, to_status, actor_id, comment)
  values (p_subtopic_id, v_status, v_to, v_actor, p_comment);
end;
$$;

comment on function public.transition_subtopic(uuid, text, text) is
  'Editorial transitions (M4 §5.5) minus publish: role matrix inside, snapshot on submit, own-draft review blocked, claim auto-release, review event — one transaction.';

-- ---------------------------------------------------------------------------
-- publish_subtopic — snapshot → derive → flip → auto-revoke preview links
-- ---------------------------------------------------------------------------
-- Derived fields (primary_video_url from the first video block, reading
-- time ceil(words/200) min 1) are computed app-side by the
-- @epharmatica/editor serializers over the FINAL content and passed in;
-- the caller then fires the tag cascade + audit + re-anchor hand-off.
create or replace function public.publish_subtopic(
  p_subtopic_id uuid,
  p_primary_video_url text,
  p_reading_minutes int
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status public.content_status;
  v_content jsonb;
  v_actor uuid := auth.uid();
begin
  if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
    raise exception 'publish_subtopic: content_manager role required' using errcode = '42501';
  end if;
  if p_reading_minutes is null or p_reading_minutes < 1 then
    raise exception 'publish_subtopic: reading_minutes must be >= 1';
  end if;

  select s.status, s.content into v_status, v_content
    from public.subtopics s where s.id = p_subtopic_id for update;
  if not found then
    raise exception 'publish_subtopic: subtopic % not found', p_subtopic_id;
  end if;
  if v_status <> 'approved' then
    raise exception 'publish_subtopic: cannot publish from % (approve first)', v_status;
  end if;

  insert into public.content_revisions (subtopic_id, content, editor_id, note)
  values (p_subtopic_id, v_content, v_actor, 'publish');

  update public.subtopics
     set status = 'published',
         published_at = now(),
         primary_video_url = p_primary_video_url,
         reading_minutes = p_reading_minutes
   where id = p_subtopic_id;

  -- Publishing auto-revokes the subtopic's preview links (M4-4, CI-probed).
  update public.preview_links
     set revoked_at = now()
   where subtopic_id = p_subtopic_id and revoked_at is null;

  insert into public.content_review_events (subtopic_id, from_status, to_status, actor_id)
  values (p_subtopic_id, v_status, 'published', v_actor);
end;
$$;

comment on function public.publish_subtopic(uuid, text, int) is
  'Publish (M4 §5.5): snapshot revision → status flip with derived fields → preview-link auto-revoke → review event, one transaction. content_manager+.';

-- ---------------------------------------------------------------------------
-- restore_revision — rollback is never destructive (M4 §5.5, rules §5.7)
-- ---------------------------------------------------------------------------
-- Copies a prior revision's content back into the subtopic AND records the
-- restore as a NEW revision (the count only ever grows). The republish
-- path then applies: the restored content goes live only via approve +
-- publish. content_manager+.
create or replace function public.restore_revision(p_revision_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rev record;
  v_actor uuid := auth.uid();
begin
  if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
    raise exception 'restore_revision: content_manager role required' using errcode = '42501';
  end if;

  select r.id, r.subtopic_id, r.content into v_rev
    from public.content_revisions r where r.id = p_revision_id;
  if not found then
    raise exception 'restore_revision: revision % not found', p_revision_id;
  end if;

  -- plain_text/headings_text are refreshed by the caller's serializer pass
  -- (they are not workflow-guarded — ordinary staff RLS writes).
  update public.subtopics
     set content = v_rev.content
   where id = v_rev.subtopic_id;

  insert into public.content_revisions (subtopic_id, content, editor_id, note)
  values (v_rev.subtopic_id, v_rev.content, v_actor, 'restore:' || v_rev.id);

  return v_rev.subtopic_id;
end;
$$;

comment on function public.restore_revision(uuid) is
  'Rollback (M4 §5.5): restores a revision by creating a NEW revision — never destructive. The republish path applies after. content_manager+.';

-- ---------------------------------------------------------------------------
-- staff_directory — names for queue claims / revision editors (M4 §5.6)
-- ---------------------------------------------------------------------------
-- profiles are owner-only under RLS (M2); the CMS shows "claimed by …" and
-- revision editor names, which needs a STAFF-gated directory of staff
-- rows only — username/display_name/role, nothing else, no plain users.
create or replace function public.staff_directory()
returns table (
  id uuid,
  username text,
  display_name text,
  role public.app_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(
    array['author', 'reviewer', 'content_manager', 'blog_editor', 'moderator',
          'jobs_manager', 'support', 'admin', 'super_admin']
  ) then
    raise exception 'staff_directory: staff role required' using errcode = '42501';
  end if;

  return query
    select p.id, p.username::text, p.display_name, p.role
      from public.profiles p
     where p.role <> 'user';
end;
$$;

comment on function public.staff_directory() is
  'Staff-only directory of staff profiles (id, username, display name, role) for CMS claim chips and revision bylines. Never returns plain users.';
