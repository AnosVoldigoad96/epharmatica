-- 019 · Published snapshot columns (founder decision, 2026-07-24 · 1.C)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- Published pages render from the PUBLISH SNAPSHOT, not live content:
-- "nobody edits published study content without a new revision" becomes a
-- hard guarantee (rules §12.5). subtopics gains published_content /
-- published_plain_text / published_headings_text, written ONLY by
-- publish_subtopic; the FTS vector regenerates over the published text so
-- draft edits stop leaking into search; and the anon role loses column
-- access to the live draft columns entirely — the strict model holds at
-- the raw API layer too. (Signed-in API users can still select live
-- content of published rows — staff tooling shares the authenticated
-- role; accepted and documented.)

-- ---------------------------------------------------------------------------
-- Columns + backfill (currently-published rows: live content IS the last
-- published state unless mid-edit — the correct baseline).
-- ---------------------------------------------------------------------------
alter table public.subtopics
  add column published_content jsonb,
  add column published_plain_text text not null default '',
  add column published_headings_text text not null default '';

update public.subtopics
   set published_content = content,
       published_plain_text = plain_text,
       published_headings_text = headings_text
 where status = 'published';

-- Workflow guard: the published_* columns join the API-immutable set.
create or replace function public.subtopics_guard_workflow_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from old.status
       or new.published_at is distinct from old.published_at
       or new.primary_video_url is distinct from old.primary_video_url
       or new.reading_minutes is distinct from old.reading_minutes
       or new.published_content is distinct from old.published_content
       or new.published_plain_text is distinct from old.published_plain_text
       or new.published_headings_text is distinct from old.published_headings_text then
      raise exception 'workflow columns change only through the workflow RPCs'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- FTS over PUBLISHED text (M1 §5.9: search covers published content only)
-- ---------------------------------------------------------------------------
drop index if exists public.subtopics_search_vector_idx;
alter table public.subtopics drop column search_vector;

alter table public.subtopics
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(published_headings_text, '')), 'B')
    || setweight(to_tsvector('english', coalesce(published_plain_text, '')), 'C')
  ) stored;

create index subtopics_search_vector_idx
  on public.subtopics using gin (search_vector);

-- ---------------------------------------------------------------------------
-- publish_subtopic: snapshot revision AND the published columns atomically
-- ---------------------------------------------------------------------------
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
         reading_minutes = p_reading_minutes,
         published_content = content,
         published_plain_text = plain_text,
         published_headings_text = headings_text
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
  'Publish (M4 §5.5 · 1.C): snapshot revision → published_* columns copied from the live draft → status flip with derived fields → preview-link auto-revoke → review event, one transaction. content_manager+.';

-- ---------------------------------------------------------------------------
-- Anon column lockdown: the public role reads the PUBLISHED surface only
-- ---------------------------------------------------------------------------
revoke select on table public.subtopics from anon;
grant select (
  id, topic_id, title, slug, preview_block_count, primary_video_url,
  reading_minutes, sort_order, status, published_at, created_at, updated_at,
  published_content, published_plain_text, published_headings_text, search_vector
) on table public.subtopics to anon;
