-- 020 · Flexible leaves (founder decision 2026-07-24, amends D4/M1-1)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- Content pages (subtopics) may attach to EITHER a topic (4-segment URL,
-- unchanged) or DIRECTLY to a chapter (3-segment URL). Topics stay pure
-- groupings — a "topic that is just content" is modeled by not creating
-- the topic. Because the reader's 3rd URL segment can now be a topic OR a
-- chapter-level page, a chapter's page slugs and topic slugs share one
-- namespace — enforced by the cross-table triggers below.

-- ---------------------------------------------------------------------------
-- Dual parent: exactly one of topic_id / chapter_id
-- ---------------------------------------------------------------------------
alter table public.subtopics
  alter column topic_id drop not null;

alter table public.subtopics
  add column chapter_id uuid references public.chapters (id) on delete cascade;

alter table public.subtopics
  add constraint subtopics_exactly_one_parent
  check (num_nonnulls(topic_id, chapter_id) = 1);

create index subtopics_chapter_id_idx on public.subtopics (chapter_id);

-- Slug uniqueness among a chapter's direct pages (the existing
-- subtopics_slug_per_parent UNIQUE covers topic-attached rows; NULL
-- topic_id rows fall out of it).
create unique index subtopics_slug_per_chapter_idx
  on public.subtopics (chapter_id, slug)
  where chapter_id is not null;

-- ---------------------------------------------------------------------------
-- Cross-namespace guard: a chapter's page slugs vs its topic slugs
-- ---------------------------------------------------------------------------
create or replace function public.subtopics_guard_chapter_slug()
returns trigger
language plpgsql
as $$
begin
  if new.chapter_id is not null and exists (
    select 1 from public.topics t
     where t.chapter_id = new.chapter_id and t.slug = new.slug
  ) then
    raise exception 'slug % collides with a topic in the same chapter', new.slug
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger subtopics_guard_chapter_slug
  before insert or update of slug, chapter_id on public.subtopics
  for each row execute function public.subtopics_guard_chapter_slug();

create or replace function public.topics_guard_leaf_slug()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.subtopics s
     where s.chapter_id = new.chapter_id and s.slug = new.slug
  ) then
    raise exception 'slug % collides with a content page in the same chapter', new.slug
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger topics_guard_leaf_slug
  before insert or update of slug, chapter_id on public.topics
  for each row execute function public.topics_guard_leaf_slug();

-- ---------------------------------------------------------------------------
-- move_content_node: subtopics may move to a topic OR a chapter
-- ---------------------------------------------------------------------------
-- New optional arg keeps existing callers valid (defaults to the old
-- semantics). Chapter-attached page histories use parent_path
-- 'subject/chapter' with level 'subtopic'. The 3-arg original must be
-- DROPPED — a new signature would otherwise create an ambiguous overload.
drop function public.move_content_node(public.content_level, uuid, uuid);

create function public.move_content_node(
  p_level public.content_level,
  p_entity_id uuid,
  p_new_parent_id uuid,
  p_new_parent_level public.content_level default null
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_affected uuid[] := '{}';
begin
  if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
    raise exception 'move_content_node: content_manager role required'
      using errcode = '42501';
  end if;

  if p_level = 'subject' then
    raise exception 'move_content_node: subjects have no parent to move to';
  end if;

  -- ------------------------------------------------------------------ subtopic
  if p_level = 'subtopic' then
    declare
      v_row record;
      v_target_level public.content_level := coalesce(p_new_parent_level, 'topic');
      v_old_parent_path text;
    begin
      select s.slug, s.status, s.topic_id, s.chapter_id,
             t.slug as topic_slug,
             coalesce(c_direct.slug, c_via.slug) as chapter_slug,
             coalesce(subj_direct.slug, subj_via.slug) as subject_slug
        into v_row
        from public.subtopics s
        left join public.topics t on t.id = s.topic_id
        left join public.chapters c_via on c_via.id = t.chapter_id
        left join public.subjects subj_via on subj_via.id = c_via.subject_id
        left join public.chapters c_direct on c_direct.id = s.chapter_id
        left join public.subjects subj_direct on subj_direct.id = c_direct.subject_id
       where s.id = p_entity_id;

      if not found then
        raise exception 'move_content_node: subtopic % not found', p_entity_id;
      end if;

      v_old_parent_path := case
        when v_row.topic_id is not null
          then v_row.subject_slug || '/' || v_row.chapter_slug || '/' || v_row.topic_slug
        else v_row.subject_slug || '/' || v_row.chapter_slug
      end;

      if v_target_level = 'topic' then
        if v_row.topic_id = p_new_parent_id then
          return v_affected;
        end if;
        if not exists (select 1 from public.topics where id = p_new_parent_id) then
          raise exception 'move_content_node: destination topic % not found', p_new_parent_id;
        end if;
        update public.subtopics
           set topic_id = p_new_parent_id, chapter_id = null
         where id = p_entity_id;
      elsif v_target_level = 'chapter' then
        if v_row.chapter_id = p_new_parent_id then
          return v_affected;
        end if;
        if not exists (select 1 from public.chapters where id = p_new_parent_id) then
          raise exception 'move_content_node: destination chapter % not found', p_new_parent_id;
        end if;
        update public.subtopics
           set chapter_id = p_new_parent_id, topic_id = null
         where id = p_entity_id;
      else
        raise exception 'move_content_node: pages attach to topics or chapters only';
      end if;

      if v_row.status = 'published' then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', p_entity_id, v_old_parent_path, v_row.slug, v_row.slug);
        v_affected := array[p_entity_id];
      end if;
    end;
    return v_affected;
  end if;

  -- -------------------------------------------------------------------- topic
  if p_level = 'topic' then
    declare
      v_row record;
      v_sub record;
    begin
      select t.slug, t.chapter_id, c.slug as chapter_slug, subj.slug as subject_slug
        into v_row
        from public.topics t
        join public.chapters c on c.id = t.chapter_id
        join public.subjects subj on subj.id = c.subject_id
       where t.id = p_entity_id;

      if not found then
        raise exception 'move_content_node: topic % not found', p_entity_id;
      end if;
      if v_row.chapter_id = p_new_parent_id then
        return v_affected;
      end if;
      if not exists (select 1 from public.chapters where id = p_new_parent_id) then
        raise exception 'move_content_node: destination chapter % not found', p_new_parent_id;
      end if;

      update public.topics set chapter_id = p_new_parent_id where id = p_entity_id;

      for v_sub in
        select s.id, s.slug
          from public.subtopics s
         where s.topic_id = p_entity_id and s.status = 'published'
      loop
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', v_sub.id,
                v_row.subject_slug || '/' || v_row.chapter_slug || '/' || v_row.slug,
                v_sub.slug, v_sub.slug);
        v_affected := v_affected || v_sub.id;
      end loop;

      if array_length(v_affected, 1) is not null then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('topic', p_entity_id,
                v_row.subject_slug || '/' || v_row.chapter_slug,
                v_row.slug, v_row.slug);
      end if;
    end;
    return v_affected;
  end if;

  -- ------------------------------------------------------------------ chapter
  declare
    v_row record;
    v_topic record;
    v_sub record;
    v_chapter_visible boolean := false;
  begin
    select c.slug, c.subject_id, subj.slug as subject_slug
      into v_row
      from public.chapters c
      join public.subjects subj on subj.id = c.subject_id
     where c.id = p_entity_id;

    if not found then
      raise exception 'move_content_node: chapter % not found', p_entity_id;
    end if;
    if v_row.subject_id = p_new_parent_id then
      return v_affected;
    end if;
    if not exists (select 1 from public.subjects where id = p_new_parent_id) then
      raise exception 'move_content_node: destination subject % not found', p_new_parent_id;
    end if;

    update public.chapters set subject_id = p_new_parent_id where id = p_entity_id;

    -- Direct chapter pages (new in 020).
    for v_sub in
      select s.id, s.slug
        from public.subtopics s
       where s.chapter_id = p_entity_id and s.status = 'published'
    loop
      insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
      values ('subtopic', v_sub.id,
              v_row.subject_slug || '/' || v_row.slug,
              v_sub.slug, v_sub.slug);
      v_affected := v_affected || v_sub.id;
      v_chapter_visible := true;
    end loop;

    for v_topic in
      select t.id, t.slug from public.topics t where t.chapter_id = p_entity_id
    loop
      declare
        v_topic_visible boolean := false;
      begin
        for v_sub in
          select s.id, s.slug
            from public.subtopics s
           where s.topic_id = v_topic.id and s.status = 'published'
        loop
          insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
          values ('subtopic', v_sub.id,
                  v_row.subject_slug || '/' || v_row.slug || '/' || v_topic.slug,
                  v_sub.slug, v_sub.slug);
          v_affected := v_affected || v_sub.id;
          v_topic_visible := true;
        end loop;

        if v_topic_visible then
          insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
          values ('topic', v_topic.id,
                  v_row.subject_slug || '/' || v_row.slug,
                  v_topic.slug, v_topic.slug);
          v_chapter_visible := true;
        end if;
      end;
    end loop;

    if v_chapter_visible then
      insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
      values ('chapter', p_entity_id, v_row.subject_slug, v_row.slug, v_row.slug);
    end if;
  end;
  return v_affected;
end;
$$;

comment on function public.move_content_node(public.content_level, uuid, uuid, public.content_level) is
  'Atomic Move… (M4 §5.3 · 020): pages move to topics OR chapters (p_new_parent_level); history cascades include chapter-direct pages. content_manager+.';

-- ---------------------------------------------------------------------------
-- rename_content_node: history paths for chapter-attached pages
-- ---------------------------------------------------------------------------
create or replace function public.rename_content_node(
  p_level public.content_level,
  p_entity_id uuid,
  p_new_slug text
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_affected uuid[] := '{}';
begin
  if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
    raise exception 'rename_content_node: content_manager role required'
      using errcode = '42501';
  end if;

  if p_new_slug is null or p_new_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'rename_content_node: invalid slug %', p_new_slug;
  end if;

  -- ------------------------------------------------------------------ subtopic
  if p_level = 'subtopic' then
    declare
      v_row record;
      v_parent_path text;
    begin
      select s.slug, s.status, s.topic_id,
             t.slug as topic_slug,
             coalesce(c_direct.slug, c_via.slug) as chapter_slug,
             coalesce(subj_direct.slug, subj_via.slug) as subject_slug
        into v_row
        from public.subtopics s
        left join public.topics t on t.id = s.topic_id
        left join public.chapters c_via on c_via.id = t.chapter_id
        left join public.subjects subj_via on subj_via.id = c_via.subject_id
        left join public.chapters c_direct on c_direct.id = s.chapter_id
        left join public.subjects subj_direct on subj_direct.id = c_direct.subject_id
       where s.id = p_entity_id;

      if not found then
        raise exception 'rename_content_node: subtopic % not found', p_entity_id;
      end if;
      if v_row.slug = p_new_slug then
        return v_affected;
      end if;

      v_parent_path := case
        when v_row.topic_id is not null
          then v_row.subject_slug || '/' || v_row.chapter_slug || '/' || v_row.topic_slug
        else v_row.subject_slug || '/' || v_row.chapter_slug
      end;

      update public.subtopics set slug = p_new_slug where id = p_entity_id;

      if v_row.status = 'published' then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', p_entity_id, v_parent_path, v_row.slug, p_new_slug);
        v_affected := array[p_entity_id];
      end if;
    end;
    return v_affected;
  end if;

  -- -------------------------------------------------------------------- topic
  if p_level = 'topic' then
    declare
      v_row record;
      v_sub record;
    begin
      select t.slug, c.slug as chapter_slug, subj.slug as subject_slug
        into v_row
        from public.topics t
        join public.chapters c on c.id = t.chapter_id
        join public.subjects subj on subj.id = c.subject_id
       where t.id = p_entity_id;

      if not found then
        raise exception 'rename_content_node: topic % not found', p_entity_id;
      end if;
      if v_row.slug = p_new_slug then
        return v_affected;
      end if;

      update public.topics set slug = p_new_slug where id = p_entity_id;

      for v_sub in
        select s.id, s.slug
          from public.subtopics s
         where s.topic_id = p_entity_id and s.status = 'published'
      loop
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', v_sub.id,
                v_row.subject_slug || '/' || v_row.chapter_slug || '/' || v_row.slug,
                v_sub.slug, v_sub.slug);
        v_affected := v_affected || v_sub.id;
      end loop;

      if array_length(v_affected, 1) is not null then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('topic', p_entity_id,
                v_row.subject_slug || '/' || v_row.chapter_slug,
                v_row.slug, p_new_slug);
      end if;
    end;
    return v_affected;
  end if;

  -- ------------------------------------------------------------------ chapter
  if p_level = 'chapter' then
    declare
      v_row record;
      v_topic record;
      v_sub record;
      v_chapter_visible boolean := false;
    begin
      select c.slug, subj.slug as subject_slug
        into v_row
        from public.chapters c
        join public.subjects subj on subj.id = c.subject_id
       where c.id = p_entity_id;

      if not found then
        raise exception 'rename_content_node: chapter % not found', p_entity_id;
      end if;
      if v_row.slug = p_new_slug then
        return v_affected;
      end if;

      update public.chapters set slug = p_new_slug where id = p_entity_id;

      for v_sub in
        select s.id, s.slug
          from public.subtopics s
         where s.chapter_id = p_entity_id and s.status = 'published'
      loop
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', v_sub.id,
                v_row.subject_slug || '/' || v_row.slug,
                v_sub.slug, v_sub.slug);
        v_affected := v_affected || v_sub.id;
        v_chapter_visible := true;
      end loop;

      for v_topic in
        select t.id, t.slug from public.topics t where t.chapter_id = p_entity_id
      loop
        declare
          v_topic_visible boolean := false;
        begin
          for v_sub in
            select s.id, s.slug
              from public.subtopics s
             where s.topic_id = v_topic.id and s.status = 'published'
          loop
            insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
            values ('subtopic', v_sub.id,
                    v_row.subject_slug || '/' || v_row.slug || '/' || v_topic.slug,
                    v_sub.slug, v_sub.slug);
            v_affected := v_affected || v_sub.id;
            v_topic_visible := true;
          end loop;

          if v_topic_visible then
            insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
            values ('topic', v_topic.id,
                    v_row.subject_slug || '/' || v_row.slug,
                    v_topic.slug, v_topic.slug);
            v_chapter_visible := true;
          end if;
        end;
      end loop;

      if v_chapter_visible then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('chapter', p_entity_id, v_row.subject_slug, v_row.slug, p_new_slug);
      end if;
    end;
    return v_affected;
  end if;

  -- ------------------------------------------------------------------ subject
  declare
    v_row record;
    v_chapter record;
    v_topic record;
    v_sub record;
    v_subject_visible boolean := false;
  begin
    select subj.slug into v_row from public.subjects subj where subj.id = p_entity_id;

    if not found then
      raise exception 'rename_content_node: subject % not found', p_entity_id;
    end if;
    if v_row.slug = p_new_slug then
      return v_affected;
    end if;

    update public.subjects set slug = p_new_slug where id = p_entity_id;

    for v_chapter in
      select c.id, c.slug from public.chapters c where c.subject_id = p_entity_id
    loop
      declare
        v_chapter_visible boolean := false;
      begin
        for v_sub in
          select s.id, s.slug
            from public.subtopics s
           where s.chapter_id = v_chapter.id and s.status = 'published'
        loop
          insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
          values ('subtopic', v_sub.id,
                  v_row.slug || '/' || v_chapter.slug,
                  v_sub.slug, v_sub.slug);
          v_affected := v_affected || v_sub.id;
          v_chapter_visible := true;
        end loop;

        for v_topic in
          select t.id, t.slug from public.topics t where t.chapter_id = v_chapter.id
        loop
          declare
            v_topic_visible boolean := false;
          begin
            for v_sub in
              select s.id, s.slug
                from public.subtopics s
               where s.topic_id = v_topic.id and s.status = 'published'
            loop
              insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
              values ('subtopic', v_sub.id,
                      v_row.slug || '/' || v_chapter.slug || '/' || v_topic.slug,
                      v_sub.slug, v_sub.slug);
              v_affected := v_affected || v_sub.id;
              v_topic_visible := true;
            end loop;

            if v_topic_visible then
              insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
              values ('topic', v_topic.id,
                      v_row.slug || '/' || v_chapter.slug,
                      v_topic.slug, v_topic.slug);
              v_chapter_visible := true;
            end if;
          end;
        end loop;

        if v_chapter_visible then
          insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
          values ('chapter', v_chapter.id, v_row.slug, v_chapter.slug, v_chapter.slug);
          v_subject_visible := true;
        end if;
      end;
    end loop;

    if v_subject_visible then
      insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
      values ('subject', p_entity_id, '', v_row.slug, p_new_slug);
    end if;
  end;
  return v_affected;
end;
$$;

comment on function public.rename_content_node(public.content_level, uuid, text) is
  'Atomic slug rename with the 301 ceremony (M4 §5.2 · 020): history cascades include chapter-direct pages. content_manager+.';
