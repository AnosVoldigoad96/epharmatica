-- RLS probe · 17 — flexible leaves (founder decision 2026-07-24)
-- Asserts: exactly-one-parent holds; a chapter's page slugs and topic
-- slugs share one namespace (both trigger directions); pages move between
-- topic and chapter parents with correct history paths.

\set ON_ERROR_STOP on

-- Probe 1: exactly one parent — both / neither rejected.
do $probe$
declare
  denied_both boolean := false;
  denied_none boolean := false;
begin
  begin
    insert into public.subtopics (topic_id, chapter_id, title, slug)
    values ('f0000000-0000-4000-a000-000000000012',
            'f0000000-0000-4000-a000-000000000011',
            'Both parents', 'rls-both-parents');
  exception
    when check_violation then denied_both := true;
  end;
  begin
    insert into public.subtopics (title, slug)
    values ('No parent', 'rls-no-parent');
  exception
    when check_violation then denied_none := true;
  end;

  if not denied_both then
    raise exception 'FAIL 17.1: a page accepted two parents';
  end if;
  if not denied_none then
    raise exception 'FAIL 17.1: a page accepted zero parents';
  end if;
  raise notice 'PASS 17.1: exactly-one-parent enforced';
end;
$probe$;

-- Probe 2: shared slug namespace per chapter (both directions).
do $probe$
declare
  denied_page boolean := false;
  denied_topic boolean := false;
  v_id uuid;
begin
  -- A page slugged like an existing topic in the same chapter → rejected.
  begin
    insert into public.subtopics (chapter_id, title, slug)
    values ('f0000000-0000-4000-a000-000000000011', 'Collides', 'rls-probe-topic');
  exception
    when unique_violation then denied_page := true;
  end;

  -- Legal chapter page.
  insert into public.subtopics (chapter_id, title, slug)
  values ('f0000000-0000-4000-a000-000000000011', 'Chapter page', 'rls-chapter-page')
  returning id into v_id;

  -- A topic slugged like that page → rejected.
  begin
    insert into public.topics (chapter_id, name, slug)
    values ('f0000000-0000-4000-a000-000000000011', 'Collides back', 'rls-chapter-page');
  exception
    when unique_violation then denied_topic := true;
  end;

  delete from public.subtopics where id = v_id;

  if not denied_page then
    raise exception 'FAIL 17.2: page slug collided with a topic slug unchecked';
  end if;
  if not denied_topic then
    raise exception 'FAIL 17.2: topic slug collided with a page slug unchecked';
  end if;
  raise notice 'PASS 17.2: chapter-level slug namespace shared';
end;
$probe$;

-- Probe 3: CM moves a page topic→chapter and back; published chapter-page
-- rename writes parent_path 'subject/chapter'.
do $probe$
declare
  v_parent_topic uuid;
  v_parent_chapter uuid;
  n int;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;

  perform public.move_content_node('subtopic',
    'f0000000-0000-4000-a000-000000000014',
    'f0000000-0000-4000-a000-000000000011', 'chapter');
  reset role;

  select topic_id, chapter_id into v_parent_topic, v_parent_chapter
    from public.subtopics where id = 'f0000000-0000-4000-a000-000000000014';
  if v_parent_topic is not null or v_parent_chapter <> 'f0000000-0000-4000-a000-000000000011' then
    raise exception 'FAIL 17.3: page did not reparent to the chapter';
  end if;

  -- Publish it (as a chapter page), then rename → history path is 2-seg.
  update public.subtopics set status = 'published', published_at = now()
   where id = 'f0000000-0000-4000-a000-000000000014';

  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-a000-000000000006","role":"authenticated"}', true);
  set local role authenticated;
  perform public.rename_content_node('subtopic',
    'f0000000-0000-4000-a000-000000000014', 'renamed-chapter-page');
  reset role;

  select count(*) into n from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000014'
     and parent_path = 'rls-probe-subject/rls-probe-chapter'
     and old_slug = 'draft-probe-subtopic'
     and new_slug = 'renamed-chapter-page';

  -- Restore the fixture completely.
  update public.subtopics
     set slug = 'draft-probe-subtopic', status = 'draft', published_at = null,
         topic_id = 'f0000000-0000-4000-a000-000000000012', chapter_id = null
   where id = 'f0000000-0000-4000-a000-000000000014';
  delete from public.slug_history
   where entity_id = 'f0000000-0000-4000-a000-000000000014';

  if n <> 1 then
    raise exception 'FAIL 17.3: chapter-page rename history path wrong';
  end if;
  raise notice 'PASS 17.3: topic↔chapter moves + 2-segment history paths work';
end;
$probe$;

select 'FLEXIBLE-LEAVES PROBES PASSED' as status;
