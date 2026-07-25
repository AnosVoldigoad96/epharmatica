-- 025 · Study-tools RPCs + highlight_kinds flag (1.D · M1-4/M1-5)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- The 006 tables already carry the full 1.D shape (anchor v:1 + moved/
-- orphaned, note→highlight cascade, idempotent progress, last_visited).
-- This migration adds the three RPCs the study layer needs:
--   · create_highlight_with_note — the M1 §5.6 atomic pair, SECURITY
--     INVOKER so owner RLS does the authorization;
--   · reanchor_fetch / reanchor_apply — the post-publish re-anchor job's
--     cross-owner read/write pair (M1 §5.5), SECURITY DEFINER and gated to
--     the publishing roles, because owner-only RLS rightly hides other
--     users' highlights from the content manager running a publish.
-- Plus the highlight_kinds flag (M1 R-M1): production can restrict
-- highlighting to prose without a schema change.

-- ---------------------------------------------------------------------------
-- Atomic highlight (+ optional note) — M1 §5.6 "popover → Note".
-- ---------------------------------------------------------------------------
create function public.create_highlight_with_note(
  p_subtopic_id uuid,
  p_anchor jsonb,
  p_color public.highlight_color,
  p_note_content jsonb default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_highlight_id uuid;
begin
  -- RLS authorizes; these are shape checks only (the CHECK constraints on
  -- highlights re-verify v:1 and the 1000-char cap).
  if p_anchor ->> 'snapshot' is null then
    raise exception 'create_highlight_with_note: anchor lacks a snapshot';
  end if;

  insert into public.highlights (user_id, subtopic_id, anchor, text_snapshot, color)
  values (auth.uid(), p_subtopic_id, p_anchor, p_anchor ->> 'snapshot', p_color)
  returning id into v_highlight_id;

  if p_note_content is not null then
    insert into public.user_notes (user_id, subtopic_id, highlight_id, content)
    values (auth.uid(), p_subtopic_id, v_highlight_id, p_note_content);
  end if;

  return v_highlight_id;
end;
$$;

comment on function public.create_highlight_with_note(uuid, jsonb, public.highlight_color, jsonb) is
  'M1 §5.6 atomic creation path: highlight + optional attached note in one transaction. SECURITY INVOKER — owner RLS authorizes both inserts; anchor CHECK constraints re-verify shape.';

revoke all on function public.create_highlight_with_note(uuid, jsonb, public.highlight_color, jsonb)
  from public, anon;
grant execute on function public.create_highlight_with_note(uuid, jsonb, public.highlight_color, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Re-anchor job pair (M1 §5.5). The matching algorithm lives in
-- @epharmatica/editor (pure, CI-fixtured); these two RPCs are its only DB
-- touchpoints. Publishing roles only — the job runs inside the publish flow.
-- ---------------------------------------------------------------------------
create function public.reanchor_fetch(p_subtopic_id uuid)
returns table (id uuid, anchor jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.anchor
    from public.highlights h
   where h.subtopic_id = p_subtopic_id
     and h.orphaned = false
     and public.has_role(array['content_manager', 'admin', 'super_admin']);
$$;

comment on function public.reanchor_fetch(uuid) is
  'Re-anchor job read side (M1 §5.5): every non-orphaned highlight anchor on a subtopic, across owners. content_manager+ only (returns nothing otherwise); no user ids exposed.';

revoke all on function public.reanchor_fetch(uuid) from public, anon;
grant execute on function public.reanchor_fetch(uuid) to authenticated, service_role;

create function public.reanchor_apply(
  p_subtopic_id uuid,
  p_results jsonb
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_action text;
  v_id uuid;
  v_count int := 0;
begin
  if not public.has_role(array['content_manager', 'admin', 'super_admin']) then
    raise exception 'reanchor_apply: content_manager role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception 'reanchor_apply: results must be an array';
  end if;

  for v_row in select * from jsonb_array_elements(p_results)
  loop
    v_id := (v_row ->> 'id')::uuid;
    v_action := v_row ->> 'action';

    if v_action = 'repath' or v_action = 'move' then
      if (v_row -> 'anchor' ->> 'v')::int is distinct from 1 then
        raise exception 'reanchor_apply: % carries no v:1 anchor', v_id;
      end if;
      update public.highlights
         set anchor = v_row -> 'anchor',
             moved = (v_action = 'move'),
             orphaned = false
       where id = v_id and subtopic_id = p_subtopic_id;
    elsif v_action = 'orphan' then
      update public.highlights
         set orphaned = true
       where id = v_id and subtopic_id = p_subtopic_id;
    elsif v_action <> 'keep' then
      raise exception 'reanchor_apply: unknown action %', v_action;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.reanchor_apply(uuid, jsonb) is
  'Re-anchor job write side (M1 §5.5): applies [{id, action: keep|repath|move|orphan, anchor?}] computed by @epharmatica/editor. move sets moved=true; repath is silent; orphan never deletes. Rows are matched inside the given subtopic only. content_manager+.';

revoke all on function public.reanchor_apply(uuid, jsonb) from public, anon;
grant execute on function public.reanchor_apply(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- highlight_kinds flag (M1 R-M1): seeded in 003 as '"all"' — normalized here
-- to the explicit kind list so the study layer needs no special "all" case.
-- Shrink the list (e.g. ["prose"]) to restrict in production, no schema
-- change; enabled=false disables creating highlights entirely.
-- ---------------------------------------------------------------------------
update public.feature_flags
   set value = '["prose", "list", "table", "drugcard", "code", "caption"]'::jsonb,
       description = 'Block kinds the highlighter accepts (M1 R-M1). Shrink the list to restrict highlighting without a schema change; enabled=false disables creating highlights entirely.'
 where key = 'highlight_kinds';
