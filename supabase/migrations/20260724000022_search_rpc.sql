-- 022 · Public search RPC (1.C-3 · M1 §5.9)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- Search runs over the PUBLISH SNAPSHOT only: the 019 search_vector is
-- generated from title + published_headings_text + published_plain_text, so
-- draft edits are structurally invisible here. SECURITY INVOKER on purpose —
-- the caller's own RLS row set applies (anon: published rows only) and the
-- explicit status filter is belt-and-braces on top.
--
-- Snippets: ts_headline over published_plain_text with NON-HTML sentinel
-- markers ([[[ / ]]]) — the app splits on the sentinels and renders <mark>
-- itself, so no HTML from the database ever reaches dangerouslySetInnerHTML.
-- ts_headline is costly, so it runs in the outer select over the already
-- ranked-and-limited row set, never the whole match set.

create or replace function public.search_published(
  p_query text,
  p_limit int default 20
)
returns table (
  subtopic_id uuid,
  title text,
  slug text,
  topic_slug text,
  topic_name text,
  chapter_slug text,
  chapter_name text,
  subject_slug text,
  subject_name text,
  snippet text,
  rank real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with query as (
    select websearch_to_tsquery('english', coalesce(p_query, '')) as q
  ),
  ranked as (
    select s.id, s.title, s.slug, s.published_plain_text,
           t.slug as topic_slug, t.name as topic_name,
           c.slug as chapter_slug, c.name as chapter_name,
           subj.slug as subject_slug, subj.name as subject_name,
           ts_rank(s.search_vector, query.q) as rank
      from public.subtopics s
      cross join query
      left join public.topics t on t.id = s.topic_id
      join public.chapters c on c.id = coalesce(t.chapter_id, s.chapter_id)
      join public.subjects subj on subj.id = c.subject_id
     where numnode(query.q) > 0
       and s.status = 'published'
       and s.search_vector @@ query.q
     order by rank desc, s.published_at desc
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
  )
  select ranked.id, ranked.title, ranked.slug,
         ranked.topic_slug, ranked.topic_name,
         ranked.chapter_slug, ranked.chapter_name,
         ranked.subject_slug, ranked.subject_name,
         ts_headline('english', ranked.published_plain_text, query.q,
           'StartSel="[[[", StopSel="]]]", MaxWords=25, MinWords=10, ShortWord=3, MaxFragments=2, FragmentDelimiter=" … "'
         ) as snippet,
         ranked.rank
    from ranked cross join query;
$$;

comment on function public.search_published(text, int) is
  'Public FTS (M1 §5.9 · 1.C-3): websearch syntax over the publish snapshot (title A / headings B / body C), rank-ordered, sentinel-marked ts_headline snippets over the limited row set only. SECURITY INVOKER — caller RLS applies; anon-safe by construction.';

-- Hard revoke, then the two API roles: search is a public surface.
revoke all on function public.search_published(text, int)
  from public, anon, authenticated;

grant execute on function public.search_published(text, int)
  to anon, authenticated, service_role;
