-- 015 · Preview-link display tail + media usage-scan RPC (M4 §5.7 / §6)
-- Forward-only (invariant I7). Rollback = a new forward migration.

-- ---------------------------------------------------------------------------
-- preview_links.token_tail — the list display (M4 §5.7 "token tail")
-- ---------------------------------------------------------------------------
-- The raw token exists only at creation (the table stores sha256). The last
-- 4 characters are captured then, purely so staff can match a shared link
-- in the per-subtopic list — 4 chars of a 128-bit token carry no meaningful
-- entropy.
alter table public.preview_links
  add column token_tail text;

-- ---------------------------------------------------------------------------
-- refresh_media_refs — the usage-scan writer (M4 §6, R-M4b)
-- ---------------------------------------------------------------------------
-- media_refs writes are service-role/definer only (probe 09.5). The publish
-- pipeline (source 'published' — authoritative) and draft saves (source
-- 'draft' — the conservative delete-block) both refresh through this RPC:
-- replace-all for one (subtopic, source) in one transaction. Asset ids not
-- present in media_assets are skipped (a dangling reference in a draft must
-- not fail the save).
create or replace function public.refresh_media_refs(
  p_subtopic_id uuid,
  p_asset_ids uuid[],
  p_source text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['author', 'content_manager', 'admin', 'super_admin']) then
    raise exception 'refresh_media_refs: author role required' using errcode = '42501';
  end if;
  if p_source not in ('published', 'draft') then
    raise exception 'refresh_media_refs: unknown source %', p_source;
  end if;
  if not exists (select 1 from public.subtopics s where s.id = p_subtopic_id) then
    raise exception 'refresh_media_refs: subtopic % not found', p_subtopic_id;
  end if;

  delete from public.media_refs
   where subtopic_id = p_subtopic_id and source = p_source;

  insert into public.media_refs (subtopic_id, asset_id, source)
  select distinct p_subtopic_id, ids.id, p_source
    from unnest(coalesce(p_asset_ids, '{}'::uuid[])) as ids (id)
   where exists (select 1 from public.media_assets a where a.id = ids.id);
end;
$$;

comment on function public.refresh_media_refs(uuid, uuid[], text) is
  'Replace-all usage refresh for one (subtopic, source) — the only media_refs write path besides the service role (M4 §6). Author+; unknown asset ids skipped.';
