# Module PRD 05 — Community (Forum · Blog · Profiles · Verification)

| | |
|---|---|
| **Module** | Community platform — hybrid forum, editorial blog, public profiles, Verified-Pharmacist flow, in-app notifications |
| **Version** | 1.0 · 18 Jul 2026 |
| **Parents** | Master PRD v1.5 (§7.6) · M2 (identity, visibility) · M4 (moderation/verification shell slots §10) · STYLE.md v1.3 |
| **Decisions** | M5-1 … M5-6 — see §2 |
| **Phase** | 2 |

## 1. Scope

**In:** the hybrid forum (D12) in full, the approved-writer blog (D13), public profile pages (`/u/`, honoring M2's visibility contract), the Verified-Pharmacist application → review → badge flow (D11), the in-app notification center, and forum search. **Out:** blog comments (off by design — "Discuss in forum" instead), email digests (deferred by M5-5), the admin shell itself (M4 §10 slots — this doc defines the queue *behavior* those slots render), payments/boosts of any kind.

## 2. Module Decision Log

| # | Decision | Choice | Consequence |
|---|---|---|---|
| M5-1 | Posting eligibility | **Verified email required** | Unverified users browse fully; composing prompts verify-first (§4.3). Master's 24-hour new-account limits stack on top. |
| M5-2 | Editing | **15-min free window → "edited" badge + public history** | `post_revisions` from the first post-window edit (§4.5). |
| M5-3 | Blog byline | **Personal + "Team ePharmatica" option for staff** | `byline_type` on posts; team posts keep internal authorship (§5.2). |
| M5-4 | Anonymity | **Question threads only; identity kept internally** | Masking enforced at the data-access layer via public views (§4.2, §10); badges never render on anonymous content. |
| M5-5 | Notifications | **In-app only in v1** | Notification center + bell; zero community email volume (§4.7). |
| M5-6 | Stale threads | **No auto-lock** — manual moderator lock with reason | Evergreen questions accumulate answers forever (§4.9). |

## 3. User Stories

1. As a first-year who's embarrassed to ask something "basic," I post a Question anonymously and get real answers — while moderators can still see it's me if I misbehave.
2. As any member, I know exactly who can post (verified emails) and why my day-old account has training-wheel limits.
3. As an answerer, I fix my typo freely for 15 minutes; after that, my edits are visible history — nobody's answer gets silently rewritten under an accepted mark.
4. As a question-asker, I mark the reply that solved it; future students find the thread answered, sorted right.
5. As a pharmacist, I apply for verification with my license scan, track the status, and wear the badge across forum, blog, and profile when approved.
6. As an approved writer, I draft under my own name — or, as staff, publish an announcement as **Team ePharmatica** — through the same review workflow as study content.
7. As a reader of a blog post, one tap takes me to its forum discussion thread.
8. As a member, my bell shows replies to threads I follow, @mentions, and "your answer was accepted" — and nothing ever emails me.

## 4. Forum Specification

### 4.1 Structure & creation
Categories (admin-managed; seed: **Study Help · Clinical Practice · Industry & Regulatory Affairs · Careers & Licensing · General Lounge · Article Discussions · Platform Feedback**). Thread composer: type (**Discussion / Question**), title (15–140 chars), category, tags (≤5, free-form, admin-mergeable), body (Plate-lite: rich text, lists, images via media rules, links, code, quotes), and — **Question type only** — the **Post anonymously** toggle (§4.2). Threads route `/community/t/[slug]` (slug from title + shortid).

### 4.2 Anonymity (M5-4)
`threads.is_anonymous` — permanent for that thread (no later reveal; stated at compose time). Public rendering: author shows as **"Anonymous student"** with the generic square avatar; no badge, no profile link; the OP's own replies inside their thread render **"Anonymous student (OP)"** for continuity; every other participant appears normally. **Identity handling:** `author_id` is stored but *unreachable* by public queries — reads go through masking views (§10); moderators see true identity in the M4 report queue; sanctions apply normally; anonymous activity never appears on the author's public profile, and @mention notifications *from* an anonymous OP hide the actor ("Someone mentioned you in a Question"). Anonymous threads count against the same rate limits (keyed to the real account).

### 4.3 Posting gates (M5-1)
Composing (thread or reply) requires a **verified email**: unverified users see the composer replaced by a verify card (resend link inline) — browsing, voting-view, and search remain open to them. Stacked on top: master new-account friction (accounts < 24 h: 2 threads + 10 replies/day) and sanction states (§4.10).

### 4.4 Replies, votes, mentions
Replies are **flat** (no nesting — per the hybrid model); **quote-reply** inserts the quoted excerpt as an attributed block for reference. Upvotes on replies only (no downvotes), one per user per reply, retractable; counts public, voter lists private. Default sort: accepted answer → most-upvoted → chronological; switcher to pure chronological persists per user. `@username` autocompletes (non-anonymous participants + any member) and fires a mention notification.

### 4.5 Editing & deletion (M5-2)
**0–15 min:** free silent edits. **After:** edits allowed indefinitely but stamp `edited` (badge with timestamp) and append to `post_revisions` — **history is publicly viewable** (transparency beats speculation). Author deletion: a reply soft-deletes to a tombstone ("Removed by author") if it's the accepted answer or has been quoted, otherwise removes cleanly; a thread deletes cleanly only with zero replies — otherwise the author requests moderator action. Moderator hide/delete per M4 queue actions, always audited.

### 4.6 Accepted answers
One per Question thread; marked/unmarked by the OP (server-verified against the real `author_id`, so anonymous OPs retain the power) or a moderator. Accepted reply pins atop with distinct framing (STYLE), thread gains the **Answered** state used in filters and search results.

### 4.7 Subscriptions & the notification center (M5-5)
Auto-subscribe on creating or replying (per-thread toggle to leave); manual **Follow** on any thread. **Bell** in the top bar with unread count; notification list (paged): *reply in a followed thread · @mention · your answer was accepted · moderation action on your content*. Mark-read (single/all); rows deep-link. **No email in v1** — the digest is an explicitly deferred enhancement; the `notifications` table is channel-agnostic so adding email later is additive.

### 4.8 Browsing & forum search
`/community`: recent activity feed + **Unanswered spotlight** (oldest unanswered Questions — the community's to-do list). Category pages: latest-activity default; filters — type, Answered/Unanswered, tag. **Forum search** (scoped box on `/community`): Postgres FTS over titles + bodies of visible threads/replies, respecting anonymity masking; unification with global content search is a later enhancement, noted in M1 §13's spirit.

### 4.9 Locks & pins (M5-6)
**No auto-lock ever** — evergreen threads keep accumulating answers. Moderators may lock (reason required → banner "Locked by moderators: {reason}"; composer disabled) and pin per category (max 3). Both audited.

### 4.10 Reports & sanction enforcement
Report on any thread/reply (reason enum + note) → M4 moderation queue (shell slot). Sanction states render honestly to the sanctioned user: composer disabled with type, reason, and expiry ("You're muted until 24 Jul — reason: …"); banned accounts retain read access to public content, nothing else. All enforcement actions come from M4's audited surface.

## 5. Blog Specification

### 5.1 Writer applications (D13)
`/blog/write` (public pitch page) → application form: motivation (≤600 chars), one writing sample (link or upload), credentials (optional). Queue in M4's Blog slot; **blog_editor decides** (approve grants the `blog_writer` capability; reject requires a reason, reapply after 30 days). Revocation exists (audited, reason, notify) — published posts remain.

### 5.2 Authoring & bylines (M5-3)
Full Plate config (same family as study content), cover image (media library, alt required), category, tags, excerpt (≤160 chars — powers cards + meta description). **Byline:** `personal` (default — the author's username/profile) or **`team`** ("Team ePharmatica" — selectable only by staff roles; real `author_id` retained internally and in audit). Team posts render a brand byline card and are excluded from personal author pages; they aggregate at `/blog/author/team`.

### 5.3 Workflow & scheduling
`draft → in_review → published` with blog_editor review (comments/suggestions), revisions, and **publish-at scheduling** (master §7.6.2; the scheduler cron flips status and fires tags). Writers edit only their own drafts; post-publish edits go through a lightweight re-review when body changes exceed a trivial threshold (title/typo-level edits pass straight through with the revision recorded).

### 5.4 Public surfaces & the forum bridge
`/blog`: latest featured + grid (cover, category chip, excerpt, byline, reading time). Post page: monograph-labeled header, reading bar (S8 reused), body, author card, related posts (shared tags), **Discuss in forum** — first click creates a Discussion thread in **Article Discussions** titled after the post, stores `discussion_thread_id`, and every subsequent click routes there; the thread body embeds a link-card back to the post. Comments stay off (A6). Full SEO: `Article` schema, OG image, author pages `/blog/author/[username]`.

## 6. Public Profiles (`/u/[username]`)
Honors M2 §4.10 (`visibility`): non-public renders the neutral private card. Public profile: avatar, display name, username, **Verified Pharmacist badge**, user type, joined date, bio — tabs: **Activity** (non-anonymous threads & replies, latest 50) · **Posts** (personal-byline blog posts). Counts shown (threads, replies, accepted answers). Anonymous contributions never surface here, by construction (§10). Study data never appears (master rule).

## 7. Verified-Pharmacist Flow (D11)
`/verify-pharmacist`: full name, license/registration number, issuing council (select + other), graduation year, document upload (license/degree scan → **private bucket**, ≤5 MB, pdf/jpg/png, sniffed). States: `none → pending → approved | rejected(reason, reapply_after=+30d)`. Review in M4's Verifications slot (support role): signed-URL doc viewer, approve (sets `is_verified_pharmacist`, `verified_at`, notify) or reject (reason required, notify). **Docs auto-purge 90 days after decision** (cron; registered in the personal-data registry). Badge rendering per STYLE §11 across forum, blog, profiles — never on anonymous content. The badge is not shown alongside the `pharmacist` user-type label redundantly (badge supersedes).

## 8. Data-Model Deltas
- `threads` **add** `is_anonymous bool default false`, `locked_reason text null`, `answered bool` (derived, indexed).
- `replies` **add** `edited_at`, `tombstoned bool`.
- **add** `post_revisions(entity_type thread|reply|blog_post, entity_id, content jsonb, editor_id, created_at)`.
- **add** `notifications(id, user_id, kind reply|mention|accepted|moderation, actor_id null when masked, thread_id/reply_id/target refs, read_at, created_at)`.
- `blog_posts` **add** `byline_type personal|team`, `excerpt`, `discussion_thread_id`, `scheduled_at` (master).
- `writer_applications` + `pharmacist_verifications` per master, **add** `rejected_reason`, `reapply_after`.
- Forum FTS: `search_vector` on threads (title+body) and replies (body).

## 9. Notifications & Emails
In-app only (M5-5) for community events. The **only** emails this module sends are transactional decisions: writer application outcome, verification outcome, sanction notices — through the M2 email pipeline. Digest infrastructure explicitly deferred; `notifications.kind` and channel-agnostic shape keep it additive.

## 10. RLS & the Anonymity Boundary (critical)
Public reads of `threads`/`replies` happen **only through security-barrier views** (`threads_public`, `replies_public`) that null `author_id`, username-join fields, and badge data whenever `is_anonymous` (threads) or the parent thread is anonymous **and** the row belongs to the OP (replies). Base-table `select` is revoked from `anon`/`authenticated` (staff roles read raw for moderation). Writes: inserts/updates via base tables with RLS checks (`author_id = auth.uid()`, verified-email claim, sanction checks via `is_sanctioned()`); accepted-answer marking via RPC verifying real OP identity. Votes: owner-insert/delete, aggregate-only exposure. **CI tests (non-negotiable):** *no non-staff query path returns an anonymous author's identity* (view + PostgREST probing fixture), *unverified email cannot insert*, *muted user cannot insert*, *OP-of-anonymous can still mark accepted via RPC*, *revision history readable, edits after window always produce revisions*.

## 11. Edge Cases & Rules
Account deletion (M2 purge): public contributions anonymize to the sentinel ("deleted user") with content retained — the pre-deletion flow offers full removal of one's posts as an explicit extra step; anonymous threads simply lose their internal pointer to the sentinel. Accepted answer deleted → tombstone retains acceptance context but content reads "Removed"; OP may re-mark another. Verified badge granted mid-thread → renders on past non-anonymous posts (identity-level, not post-level). Team-byline post's internal author leaves staff → byline unaffected. Locked threads remain quotable and searchable. Writer loses `blog_writer` with a scheduled post pending → schedule cancels to draft, editor notified.

## 12. Analytics Events (Umami)
`thread_created` (type, anonymous) · `reply_created` · `reply_upvoted` · `answer_accepted` · `thread_followed` · `notification_opened` (kind) · `report_filed` (target) · `writer_application_submitted` · `blog_post_published` (byline) · `blog_discuss_clicked` · `verification_submitted` · `verification_decided` (outcome, cron/actor-agnostic) · `profile_viewed`.

## 13. Acceptance Criteria (module gate)
1. **Anonymity holds at the network layer:** a probing fixture (PostgREST direct, filters, ordering tricks, embedded joins) cannot recover an anonymous author from any non-staff credential; moderator surface shows identity; "(OP)" continuity renders.
2. Verified-email gate: unverified account sees verify-card composer everywhere; verification unlocks without re-login.
3. Edit policy boundary-tested at 14:59 vs 15:01 — silent vs badge+revision; public history renders both versions.
4. Accepted-answer loop incl. anonymous OP via RPC; sort orders correct; Answered filter accurate.
5. Notification center: all four kinds fire, deep-link, mark-read; masked-actor mention text verified; zero emails sent in a full community e2e run.
6. Blog: application → approval → draft → review → schedule → auto-publish → Discuss-in-forum creates once and routes thereafter; team byline restricted to staff and excluded from personal author pages.
7. Verification: approve and reject paths with emails; badge renders across all surfaces except anonymous content; 90-day doc purge proven with a clock-controlled cron test; registry entry present.
8. Sanctions: muted/banned states render honestly and block writes at RLS (not just UI).
9. Moderator lock/pin with reasons, audited; no auto-lock job exists anywhere.

## 14. Module Risks
- **R-M5a — anonymity abuse** (harassment behind the mask): bounded to Question threads, internal identity + normal sanctions + report path; monitored via report-rate on anonymous vs named threads; policy lever ready (flag `anon_questions`).
- **R-M5b — cold-start emptiness:** launch plan requires 20 staff-seeded threads across categories + the Unanswered spotlight + weekly "question of the week" ritual; success metric per master (threads/week, accepted-answer rate).
- **R-M5c — moderation load** (master R5): new-account limits, one queue, category-scoped moderator recruitment from early Verified members.
- **R-M5d — masking-view performance:** views add join cost — indexed, measured in CI perf smoke; acceptable at this scale, Meilisearch/mat-views as later levers.

## 15. Open Items
Email digest (deferred, M5-5). Global search unification (M1+M5 indexes). Reputation/karma beyond accepted-answer counts — deliberately absent; revisit only with evidence. Category list evolution is admin-operational, not spec.

*End Module PRD 05 · decisions M5-1…M5-6 locked · next: M6 Jobs Portal.*
