-- 009 · Full-text search (master PRD §7.2.7 · M1 §5.9 · ARCH §4.2)
--
-- search_vector is a STORED generated column weighted A(title) /
-- B(headings_text) / C(plain_text). plain_text and headings_text are
-- refreshed on every save by the app via the @epharmatica/editor block-walk
-- serializers (they include table, Drug Card, and caption text — the same
-- text-run machinery highlights use), so the generated column re-derives
-- automatically on any of those writes. Queries use websearch_to_tsquery
-- against published rows only (features/content/search.ts).

alter table public.subtopics
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(headings_text, '')), 'B')
    || setweight(to_tsvector('english', coalesce(plain_text, '')), 'C')
  ) stored;

create index subtopics_search_vector_idx
  on public.subtopics using gin (search_vector);

-- Supporting trigram indexes: fuzzy title/name matching (typo-tolerant
-- lookups, the WhatsApp bot's topic search fallback, admin tree search).
create index subtopics_title_trgm_idx
  on public.subtopics using gin (title extensions.gin_trgm_ops);

create index topics_name_trgm_idx
  on public.topics using gin (name extensions.gin_trgm_ops);

create index subjects_name_trgm_idx
  on public.subjects using gin (name extensions.gin_trgm_ops);
