# Module PRD 01 — Learning Platform

|               |                                                                  |
| ------------- | ---------------------------------------------------------------- |
| **Module**    | Learning Platform (content tree · reader · study tools · search) |
| **Version**   | 1.0 · 18 Jul 2026                                                |
| **Parents**   | Master PRD v1.5 (§7.2) · ARCHITECTURE.md v1.1 · STYLE.md v1.3    |
| **Decisions** | M1-1 … M1-6 (this doc's MCQ round) — see §2                      |
| **Phase**     | 1 (with Phase-0 route scaffolding)                               |

## 1. Scope

**In:** the public/gated reading experience for study content — subject/chapter/topic/subtopic navigation, the subtopic reader, previews, highlights, notes, bookmarks, manual progress + stamp, and content search. **Out (owned elsewhere):** authoring & editorial workflow surfaces (M4 CMS — this doc defines only the _content contract_ it must satisfy), accounts (M2), AI features (M3), assessments (Phase 5). Everything already locked in the master PRD (hierarchy D4, preview model D8, manual progress D5, Plate D2, FTS search, ISR strategy) is inherited, not re-decided.

## 2. Module Decision Log

| #    | Decision               | Choice                                                                              | Consequence                                                                                                                                                                                             |
| ---- | ---------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1-1 | Reader pagination      | **One page per subtopic**; topic page = overview + blister list                     | Routes deepen to 4 levels (§4); ISR and mark-complete operate per URL; supersedes the master PRD's "hide the redundant level" note — the topic overview always exists, even for single-subtopic topics. |
| M1-2 | Video placement        | **Author-placed embed blocks anywhere** (no fixed slots)                            | `short_video_url` / `long_video_url` columns are **dropped**; a derived **`primary_video_url`** (first video block, computed at publish) preserves the WhatsApp-bot and card-thumbnail contracts.       |
| M1-3 | Offline reading        | **Not in v1**                                                                       | No service-worker architecture now; PWA metadata (STYLE §6.9) ships anyway, so a later cache layer is additive.                                                                                         |
| M1-4 | Highlight scope        | **Any block** — incl. tables, Drug Cards, captions, code                            | Universal typed-anchor scheme required (§5.5); module risk R-M1 (§12).                                                                                                                                  |
| M1-5 | Notes surfaces         | **Both** — inline at anchors + aggregating drawer; every highlight can carry a note | One data model, two render surfaces (§5.6).                                                                                                                                                             |
| M1-6 | Incremental publishing | **Subtopic-by-subtopic**; drafts hidden (no "coming soon" cells)                    | Visibility cascade + unpublish behavior defined in §5.10.                                                                                                                                               |

## 3. User Stories (learner)

1. As a visitor, I can read the preview of any published subtopic and understand exactly what signing in unlocks.
2. As a signed-in learner, I open a subject and see, at a glance, how far I am — per chapter and per topic — via blister strips and state glyphs.
3. I read a subtopic on a 360px phone in comfortable type, adjust size with A−/A+, and watch the embedded video without the page ever janking.
4. I highlight anything I can select — a sentence, a table row, a Drug Card field — in one of four colors, and it's there when I return on any device.
5. I attach a note to any highlight, or jot a free note on the subtopic, and find them all again in one drawer (and in my dashboard).
6. I mark a subtopic complete, get the stamp, and see the topic's blister strip fill.
7. I search across all published content and jump straight to the right subtopic, filtered by subject or semester if I want.
8. If an author reorganizes content, my highlights survive where possible — and where not, they appear as recoverable orphans, never silently vanish.

## 4. Information Architecture & Routes

```
/learn                                        Subject index (cards + per-subject progress)
/learn/[subject]                              Chapter list (blister strips per chapter)
/learn/[subject]/[chapter]                    Topic list (blister grid of topics)
/learn/[subject]/[chapter]/[topic]            Topic OVERVIEW — description, semester tag,
                                              progress strip, blister list of published subtopics,
                                              "Continue" (first incomplete) / "Start"
/learn/[subject]/[chapter]/[topic]/[subtopic] READER (§5.2)
/search                                       Content search (§5.9)
```

Slugs unique **per parent** (composite uniqueness `(topic_id, slug)` etc.); `slug_history` records every rename at every level and issues 301s; canonical URLs always the full 4-segment path. Breadcrumbs render all levels; the topic segment in a subtopic URL is load-bearing (no orphan shortcuts).

## 5. Functional Specification

### 5.1 Topic overview page

Header (title, semester chip, chapter breadcrumb) → one-paragraph topic description (plain text field, author-written, ≤280 chars) → **progress strip** (one glyph per _published_ subtopic, S9 placement rules apply to the reader, not here) → **blister list**: each cell = subtopic title, reading-time chip, state glyph, and stamp chip when complete; cells link to the reader. Signed-out users see the same list (glyphs omitted). Primary action: **Continue** → first incomplete published subtopic (falls back to first). Topic pages are ISR, tag `topic:{id}`.

### 5.2 Subtopic reader

Layout (mobile-first per STYLE §6): top bar → chip sub-nav of sibling subtopics (current active) → title block (monograph label `TOPIC · {topic}`, h1, meta chips: reading time, `UPDATED {date}`, semester) → 2px reading bar (S8) → rendered content → prev/next pair → (signed-in) action bar on mobile / inline actions on desktop. Reading-time = `ceil(words/200)` min 1, computed at publish. **Prev/next traversal:** within the topic by `order`; at topic end → first subtopic of the next topic in the chapter; at chapter end → next chapter's first topic's first subtopic; at subject end → subject page. Only published subtopics participate. "Continue where you left off" (dashboard) = **last-opened subtopic** (a lightweight `last_visited` upsert on reader open, signed-in only).

### 5.3 Video handling (M1-2)

Videos are Plate **video-embed blocks** placeable anywhere, any count. Render = lite facade (thumbnail + play, `youtube-nocookie.com` on click) with a mandatory author-entered caption line (`FIG`-style, per STYLE §8/§9 framing). **`primary_video_url` derivation:** at publish, the first video block's URL is copied to `subtopics.primary_video_url` (nullable); consumed by the WhatsApp bot, topic-overview cells (small play glyph), and OG cards. No video → field null, consumers degrade gracefully.

### 5.4 Preview gating (inherits D8)

Anonymous responses contain only the first `preview_block_count` blocks (server truncation; gated JSON never serialized). **Default rule:** blocks up to (exclusive) the first heading that appears after index 0, capped at 5 blocks; authors may override per subtopic (0 = title-only tease is disallowed; minimum 1 block). The gate UI: content fade + sign-in card ("Continue reading free — sign in") listing what an account adds. SEO metadata derives from title + preview text only. All study tools (highlight/note/bookmark/complete) require auth by construction — their targets don't exist in anonymous payloads.

### 5.5 Highlights — universal typed anchors (M1-4)

Four colors (STYLE §3 tokens). Selection popover per STYLE §11 (caret-anchored desktop, docked sheet on touch). Max selection 1,000 characters; overlapping highlights permitted (renderer splits ranges; the newest range's color wins on the overlap). Signed-in only.

**Anchor schema** — `highlights.anchor jsonb`:

```json
{
  "v": 1,
  "block_id": "…",
  "kind": "prose | table | drugcard | code | caption",
  "path": [], // kind-specific locator, see below
  "start": 0,
  "end": 42, // character offsets within the located text run
  "snapshot": "exact selected text (≤1000 chars)"
}
```

- **prose** (paragraphs, headings, list items, callout bodies, blockquotes): `path: []`, offsets over the block's concatenated plain text.
- **table**: `path: [rowIndex, colIndex]`, offsets within the cell text.
- **drugcard**: `path: ["field_key"]` (e.g. `["adverse_effects"]`), offsets within that field.
- **code**: `path: [lineIndex]`, offsets within the line.
- **caption**: `path: ["caption"]` on figure/video blocks.

**Re-anchoring on republish** (runs as a post-publish job over affected highlights, in order): (1) exact `block_id + path + offsets` still valid and snapshot matches → keep; (2) snapshot found within the same block (path drift) → re-derive path/offsets; (3) snapshot found once elsewhere in the subtopic → move, mark `moved=true`; (4) otherwise → `orphaned=true`. Orphans never render in-content; they surface in the notes drawer and "My Highlights" with their snapshot, restorable by the user via re-selection. Renderer contract: every block type exposes `getTextRuns(path)` through `lib/editor`, so highlight logic never touches Slate internals (Invariant I4).

### 5.6 Notes (M1-5)

One table, two surfaces. `user_notes(id, user_id, subtopic_id, highlight_id nullable, content jsonb)` — lightweight Plate (marks + lists only).

- **Inline surface:** a highlight with a note shows a 12px square note glyph at its anchor end; tap/click opens a popover (desktop) or sheet (mobile) showing the note with edit/delete. Anonymous never sees any of this layer.
- **Drawer surface:** "Notes" (action bar / toolbar) opens the drawer (side panel ≥`md`, bottom sheet below): sections **On this page** — highlight-notes with color dot + snapshot context + jump-to-anchor, then free subtopic notes — and an **Add note** action creating a free note. Orphaned-highlight notes appear here flagged `ORPHANED` with snapshot.
- **Creation paths:** popover → _Note_ creates highlight (last-used color) + note atomically; popover → _Highlight_ then note later via the glyph; drawer → free note. Deleting a highlight with a note asks once, deletes both.

### 5.7 Bookmarks

Subtopic and topic level only. Toggle in reader toolbar / topic header; dashboard list grouped by subject with state glyphs. `bookmarks(user_id, target_type, target_id)` unique.

### 5.8 Progress & the stamp

`progress(user_id, subtopic_id, completed_at)` unique. Mark/unmark from the reader (action bar "Complete" / inline button); stamp behavior per STYLE §7.3 (unmark removes without ceremony). Roll-ups are computed at read time (`completed / published` per topic → chapter → subject); no denormalized counters in v1. Completion is independent of scroll position by design (D5).

### 5.9 Search (Phase-1 scope: study content only)

Postgres FTS over published subtopics: `search_vector = A(title) + B(headings) + C(body plain text incl. table/drugcard/caption text)`. Query: `websearch_to_tsquery`, min 2 chars, 300ms debounce, top 20. Filters: subject (multi), semester. Result card: subject › chapter › topic path, subtopic title, highlighted snippet (`ts_headline`), reading time, state glyph when signed in. Empty state per STYLE voice ("No matches for '…'. Try fewer words or a subject filter."). `/search` is dynamic (no ISR); queries logged as aggregate Umami events only (no per-user query storage).

### 5.10 Incremental publishing & visibility (M1-6)

A **topic is visible** when it has ≥1 published subtopic; a **chapter** when ≥1 visible topic; a **subject** when ≥1 visible chapter — one recursive rule, enforced in the read queries (not by status flags on parents). Draft subtopics are simply absent: blister lists close the gap (order preserved among published), prev/next skip them, sitemap/FTS include published only. **Unpublishing** a live subtopic: URL 302→ its topic overview with a one-line notice ("This unit is being revised."); highlights/notes/progress rows are retained untouched and resurface if it returns; `slug_history` keeps the slug reserved. Fully unpublishing a topic's last subtopic hides the topic (same redirect logic up a level).

## 6. Data-Model Deltas (vs master PRD §9)

- `subtopics`: **drop** `short_video_url`, `long_video_url`; **add** `primary_video_url text null` (derived at publish, §5.3), `description`-free (topic owns description); `preview_block_count int null` (null = default rule §5.4).
- `topics`: **add** `description varchar(280)`.
- `highlights.anchor` conforms to §5.5 schema (`v` field enables future migrations); **add** `moved bool default false`.
- **add** `last_visited(user_id, subtopic_id, visited_at)` — single row per user (upsert), powers "Continue".
- `slug_history` gains `level` (`subject|chapter|topic|subtopic`) + parent path snapshot for 301 building.

## 7. RLS Summary

`subjects/chapters/topics/subtopics`: public `select` where published (parents' visibility enforced in queries per §5.10; RLS guards row status only). `highlights`, `user_notes`, `bookmarks`, `progress`, `last_visited`: owner-only (archetype a). Writes to content tables: staff roles only (archetype b). CI RLS tests add: _anon cannot select draft subtopics_, _owner isolation on all five study tables_, _no role below author can update `primary_video_url`_.

## 8. Caching & Revalidation (refines ARCH §6)

`subtopic:{id}` → reader page. `topic:{id}` → overview + sibling readers' chip nav (publish of any sibling revalidates the topic tag; readers subscribe to both their own and their topic's tag). `chapter:{id}`, `subject:{slug}` → lists + `/learn`. Publish pipeline fires: own subtopic tag + ancestors + `sitemap`. `/search`, dashboard, and anything cookie-personalized: dynamic.

## 9. Edge Cases & Rules

Single-subtopic topics keep their overview (M1-1). A subtopic moved to another topic = republish under new path + `slug_history` 301 + re-anchor job (§5.5). Reading-time recomputes every publish. Highlights on preview-visible blocks still require auth (tools absent for anon). Concurrent mark-complete taps are idempotent (unique constraint). Topic description absent → overview omits the paragraph (no placeholder). Video block with unparseable URL fails validation at save (CMS contract).

## 10. Analytics Events (Umami)

`subtopic_opened`, `subtopic_completed`, `subtopic_uncompleted`, `highlight_created` (prop: kind), `note_created` (prop: attached|free), `bookmark_toggled`, `search_performed` (prop: has_filters), `search_result_clicked`, `preview_gate_viewed`, `preview_gate_signin_clicked`, `continue_clicked`, `video_played`.

## 11. Acceptance Criteria (module gate, extends Phase-1 gate)

1. All five `/learn` levels render ISR with correct tags; publishing a subtopic updates its topic overview and sibling chip navs without redeploy.
2. Preview truncation verified at the network layer: anonymous payloads contain exactly the preview blocks, never more.
3. Highlights: create/restore verified across **every** block kind (prose, list, callout, table cell, Drug Card field, code line, caption) on desktop and touch; republish fixtures demonstrate keep / re-path / move / orphan outcomes; orphans restorable.
4. Notes: both surfaces work; highlight+note atomic create; delete cascade confirmed.
5. Progress: complete/unmark idempotent; roll-ups correct with hidden drafts present; stamp per STYLE.
6. Incremental publishing: a topic with 2 of 5 subtopics published shows exactly 2 cells, correct prev/next, correct sitemap; unpublish redirects and preserves user data.
7. Search returns table/Drug-Card text matches; filters work; zero personal queries stored.
8. Reader meets STYLE budgets on a mid-range Android profile (LCP ≤ 2.5s, CLS ≤ 0.1, JS ≤ 200KB gz).

## 12. Module Risks

- **R-M1 (from M1-4): universal-anchor complexity.** Highest-risk code in the module. Mitigations: anchors only via the `lib/editor` run-API (I4); versioned anchor schema; exhaustive fixture suite per block kind in CI; orphan-first failure mode (never data loss); feature flag `highlight_kinds` can restrict to prose in production without schema change if defects surface.
- **R-M2: re-anchor job cost** on large edits — bounded per-subtopic batch, async post-publish, observable in admin.

## 13. Open Items

- Topic description authoring lands in M4 (CMS) — contract fixed here.
- Cross-topic "related units" links: explicitly deferred (not asked; revisit after launch data).
- Export of highlights/notes (JSON) ships with M2 settings; format defined there against this schema.

_End Module PRD 01 · decisions M1-1…M1-6 locked · next: M2 Accounts & Profiles._
