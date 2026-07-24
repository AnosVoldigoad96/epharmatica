-- 021 · Anon grant for subtopics.chapter_id (flexible-leaves follow-up)
-- Forward-only (invariant I7). Rollback = a new forward migration.
--
-- 019 rewrote anon's subtopics access as an explicit column list; 020 added
-- chapter_id (flexible leaves) but never extended that grant, so the anon
-- published-tree query — which selects chapter_id to place a chapter's
-- direct pages — fails with permission denied. Grant the single column.
-- chapter_id is pure structure (which chapter a page hangs under), exactly
-- as public as topic_id; no draft data is exposed (I3 intact).

grant select (chapter_id) on table public.subtopics to anon;
