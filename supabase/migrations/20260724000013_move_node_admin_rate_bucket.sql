-- 013 · Move… cross-parent flow (M4 §5.3) + admin mutation rate bucket (M4 §4)
-- Forward-only (invariant I7). Rollback = a new forward migration.

-- ---------------------------------------------------------------------------
-- auth_rate_limits: admit the admin-mutation bucket
-- ---------------------------------------------------------------------------
-- M4 §4: admin routes sit behind stricter rate limits, separate from public.
-- Same table, same atomic hit RPC; the bucket list is CHECK-constrained so
-- each new bucket is a deliberate migration.
alter table public.auth_rate_limits
  drop constraint auth_rate_limits_bucket_known;

alter table public.auth_rate_limits
  add constraint auth_rate_limits_bucket_known check (
    bucket in ('signup', 'signin', 'reset', 'username_check', 'admin_mutation')
  );

-- ---------------------------------------------------------------------------
-- move_content_node — the atomic core of Move… (M4-1 / §5.3)
-- ---------------------------------------------------------------------------
-- One transaction: reparent + slug_history rows for every publicly visible
-- node whose URL changed. Returns the published subtopic ids affected — the
-- caller (server action) fires tag invalidations and enqueues the re-anchor
-- job (M1 §5.5) with them, then audits via withAudit() (I8).
--
-- SECURITY DEFINER with the role gate INSIDE (content_manager+ — the same
-- set slug_history_staff_insert trusts). Slug collisions under the new
-- parent surface as unique_violation (23505) for the action to translate.
-- Draft nodes move without ceremony: no history rows, empty return.
create or replace function public.move_content_node(
  p_level public.content_level,
  p_entity_id uuid,
  p_new_parent_id uuid
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
    begin
      select s.slug, s.status, s.topic_id,
             t.slug as topic_slug, c.slug as chapter_slug, subj.slug as subject_slug
        into v_row
        from public.subtopics s
        join public.topics t on t.id = s.topic_id
        join public.chapters c on c.id = t.chapter_id
        join public.subjects subj on subj.id = c.subject_id
       where s.id = p_entity_id;

      if not found then
        raise exception 'move_content_node: subtopic % not found', p_entity_id;
      end if;
      if v_row.topic_id = p_new_parent_id then
        return v_affected;
      end if;
      if not exists (select 1 from public.topics where id = p_new_parent_id) then
        raise exception 'move_content_node: destination topic % not found', p_new_parent_id;
      end if;

      update public.subtopics set topic_id = p_new_parent_id where id = p_entity_id;

      if v_row.status = 'published' then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', p_entity_id,
                v_row.subject_slug || '/' || v_row.chapter_slug || '/' || v_row.topic_slug,
                v_row.slug, v_row.slug);
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

      -- History for every published subtopic beneath (their full old paths)
      -- and for the topic itself when it was publicly visible (M1-6 rule:
      -- visible = ≥1 published subtopic).
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

    for v_topic in
      select t.id, t.slug
        from public.topics t
       where t.chapter_id = p_entity_id
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

comment on function public.move_content_node(public.content_level, uuid, uuid) is
  'Atomic Move… (M4 §5.3): reparent + slug_history rows for every publicly visible node whose URL changed. content_manager+ only; returns affected published subtopic ids for tag invalidation and re-anchoring.';

-- ---------------------------------------------------------------------------
-- rename_content_node — slug renames with the same 301 ceremony (M4 §5.2)
-- ---------------------------------------------------------------------------
-- Renaming a slug with anything published beneath routes through the same
-- atomic history cascade as Move…: the node's own old→new slug row plus a
-- row per publicly visible descendant whose full path contained the old
-- slug. Draft-only renames never call this — the action updates directly
-- (authors included); this RPC is the ceremonial path, content_manager+.
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
    begin
      select s.slug, s.status,
             t.slug as topic_slug, c.slug as chapter_slug, subj.slug as subject_slug
        into v_row
        from public.subtopics s
        join public.topics t on t.id = s.topic_id
        join public.chapters c on c.id = t.chapter_id
        join public.subjects subj on subj.id = c.subject_id
       where s.id = p_entity_id;

      if not found then
        raise exception 'rename_content_node: subtopic % not found', p_entity_id;
      end if;
      if v_row.slug = p_new_slug then
        return v_affected;
      end if;

      update public.subtopics set slug = p_new_slug where id = p_entity_id;

      if v_row.status = 'published' then
        insert into public.slug_history (level, entity_id, parent_path, old_slug, new_slug)
        values ('subtopic', p_entity_id,
                v_row.subject_slug || '/' || v_row.chapter_slug || '/' || v_row.topic_slug,
                v_row.slug, p_new_slug);
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
  'Atomic slug rename with the 301 ceremony (M4 §5.2): new slug + slug_history rows for the node and every publicly visible descendant. content_manager+ only; returns affected published subtopic ids.';

-- ---------------------------------------------------------------------------
-- count_affected_highlights — the consequence sheet's "N highlights" line
-- ---------------------------------------------------------------------------
-- highlights are owner-only under RLS (M1 §7); the consequence sheet needs
-- an AGGREGATE count over the affected subtopics, staff-gated, exposing no
-- row data.
create or replace function public.count_affected_highlights(p_subtopic_ids uuid[])
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['author', 'reviewer', 'content_manager', 'admin', 'super_admin']) then
    raise exception 'count_affected_highlights: staff role required'
      using errcode = '42501';
  end if;

  return (
    select count(*)
      from public.highlights h
     where h.subtopic_id = any (p_subtopic_ids)
  );
end;
$$;

comment on function public.count_affected_highlights(uuid[]) is
  'Aggregate highlight count over subtopics for the Move…/rename consequence sheets (M4 §5.3). Staff-only; returns a number, never rows.';
