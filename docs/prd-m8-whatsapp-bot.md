# Module PRD 08 — WhatsApp Content Bot

|               |                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------- |
| **Module**    | WhatsApp Content Bot — inbound-only assistant on Meta's Cloud API                                              |
| **Version**   | 1.0 · 18 Jul 2026                                                                                              |
| **Parents**   | Master PRD v1.5 (§7.9, D15) · M1 (`primary_video_url` contract) · M4 (console slot) · M3 §13 (no-LLM boundary) |
| **Decisions** | M8-1 … M8-6 — see §2                                                                                           |
| **Phase**     | 4                                                                                                              |

## 1. Scope

**In:** the user-initiated bot end-to-end — dedicated number setup, bilingual (English / Roman Urdu) menu system, the four content flows (topics, blogs, jobs, about), alert-interest capture, human handoff, per-contact rate limiting, webhook architecture, logging with 90-day retention, and the CMS console behavior for M4's slot. **Out (dormant by design):** all business-initiated messaging (templates, alerts, marketing — opt-ins stored now, sending activates only when funded per D15), any LLM parsing (menus + FTS only; the M3 §13 contract governs if that ever changes), Urdu-script catalog (noted future).

## 2. Module Decision Log

| #    | Decision       | Choice                                                        | Consequence                                                                                                                             |
| ---- | -------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| M8-1 | Number         | **New dedicated number**                                      | Avoids the Cloud-API trap: a connected number stops working in the normal WhatsApp app. Provisioned solely for the bot (§4.1).          |
| M8-2 | Language       | **English + Roman Urdu**, chosen at greeting                  | Two string catalogs (~30 strings each); choice persists per contact; `LANG` switches anytime (§4.2). Content titles/links stay English. |
| M8-3 | Memory         | **Resume last menu within 24 h; greet fresh after**           | `wa_sessions` state machine with a 24 h staleness rule; `MENU` always resets (§4.3).                                                    |
| M8-4 | Alert interest | **Menu item — "Job alerts (coming soon)" registers interest** | Sets `opt_in_alerts` with copy that is explicit about _registration, not activation_ (§4.4).                                            |
| M8-5 | Handoff        | **"Talk to a human" → support email + CMS flag**              | Reply carries support address + a reference code; session flagged for the console (§4.4).                                               |
| M8-6 | Rate limit     | **30 messages/hour per contact**                              | Rolling window; one notice, then silence within the window; webhook idempotency independent of it (§4.6).                               |

## 3. User Stories

1. As a student, I message the number, tap **English** or **Roman Urdu** once, and the bot speaks my way forever after.
2. I type "loop diuretics", tap the right match from three buttons, and get a two-line summary, the study link, and the video link when one exists.
3. I check the latest blog posts or the newest jobs in two taps, each with a link that opens the site.
4. I tap **Job alerts (coming soon)** and know I've _registered interest_ — nothing will message me until the feature truly launches, and STOP always works.
5. When the menus can't help, **Talk to a human** gives me a real support address and a reference code — and the team actually sees my conversation flagged.
6. If I come back the same afternoon, the bot remembers where I was; next week, it greets me fresh.

## 4. Functional Specification

### 4.1 Number & platform setup (M8-1)

A **new dedicated number** (SIM retained securely offline) registered to the WhatsApp Business Cloud API under the ePharmatica Meta Business account: display name, square brand-mark profile photo, About line linking `epharmatica.com` and the WhatsApp privacy note. Webhook endpoint `/api/whatsapp/webhook` — GET verification (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`) + POST with `X-Hub-Signature-256` verification (`WHATSAPP_APP_SECRET`). _Standing note (master):_ re-verify Meta's current pricing for user-initiated service conversations at build time — this module's economics assume the free service window.

### 4.2 Language (M8-2)

First contact → greeting with two reply buttons: **English** / **Roman Urdu**; stored on `wa_contacts.lang`. All bot strings come from two code-owned catalogs (`en`, `ur-latn`) — the Roman-Urdu catalog written the way people type ("_Kya dhoondna chahte hain? Topic ka naam likhein._"), reviewed by a native speaker before launch (R-M8b). `LANG` keyword re-offers the choice anytime. Dynamic content (topic titles, blog titles, job lines) renders in its source language with catalog framing around it.

### 4.3 Session model (M8-3)

`wa_sessions(contact, state, flagged, updated_at)` — a small state machine (`greeting · menu · topic_query · topic_results · …`). Inbound within **24 h** of `updated_at` resumes: _"Welcome back — you were browsing Jobs. Reply MENU to start over."_ Beyond 24 h → fresh greeting (language remembered, not re-asked). `MENU` resets from anywhere, always listed in footers.

### 4.4 Menus & flows

**Main menu** (interactive list): **1 Find a topic · 2 Latest blogs · 3 New jobs · 4 Job alerts (coming soon) · 5 Talk to a human · 6 About ePharmatica.**

- **Find a topic:** prompt for keywords → Postgres FTS (published subtopics, M1 §5.9 index) → top 3 as reply buttons (subject › topic context in the label) → selection returns: title, a ~200-character summary derived from the preview text, the study URL, and — when `primary_video_url` exists (M1-2 contract) — the video link on its own line. No matches → _"Nothing found for that — try fewer or different words (e.g., 'diuretics')."_
- **Latest blogs:** newest 3 published — title · excerpt · link.
- **New jobs:** newest 5 live — title — organization — city · link. Selecting an expired job (race) → _"That listing just closed."_ + a fresh list.
- **Job alerts (M8-4):** sets `opt_in_alerts = true` → _"Noted! You're on the list for job alerts. **Nothing will be sent until the feature launches** — and STOP works anytime."_ Already-registered → gentle acknowledgment.
- **Talk to a human (M8-5):** replies with `support@epharmatica.com` + reference code (session short-id) and sets `flagged = true`; the console surfaces flagged sessions (§4.8). No promises of response time beyond _"a human will read this thread."_
- **About:** one-paragraph blurb + site link + privacy-note link.
  Unrecognized input outside an active flow → one gentle fallback with the menu (never repeated back-to-back).

### 4.5 Universal keywords

`MENU` (reset) · `LANG` (language) · `STOP` — sets `do_not_contact = true` and `opt_in_alerts = false`, replies with a single confirmation; because the bot is inbound-only, later messages from the user are still answered (they re-initiated), but no future outbound feature may ever target the contact unless they explicitly re-register. `START` clears `do_not_contact`.

### 4.6 Rate limiting & idempotency (M8-6)

**30 inbound messages / rolling hour / contact:** on breach, one notice (_"You're sending quickly — I'll pause for a bit. Reply after a while."_), then silence for the remainder of the window (all inbound still logged). Independently, every webhook delivery is **idempotent by `wamid`** (Meta retries duplicates): processed ids short-circuit. Malformed or non-text payloads (§7) never crash processing.

### 4.7 Architecture recap

Webhook (signature-verified, idempotent) → intent router (state machine + FTS; **no LLM**, per D15/M3 §13) → replies via `lib/integrations/whatsapp.ts` only (I10) → Graph API. Kill-switch: `wa_bot_enabled` flag (M4) short-circuits the router to a single "temporarily unavailable" reply. Retention cron purges `wa_messages` > 90 days (contacts + flags persist). Everything server-side; nothing about this module ships client code.

### 4.8 CMS console (behavior for M4's WhatsApp slot)

**Conversation log:** sessions list (masked phone `+92 ••• ••34`, language, last activity, flagged filter, intent of last message); **transcript view** per session (unmask requires an audited click — `wa_phone_revealed` in `audit_log`). **Stats strip:** sessions/week, intent breakdown, alert-interest count, flagged-open count. **Controls:** kill-switch toggle, read-only view of both string catalogs (strings are code-owned; the console is for reference), retention-cron health. All actions audited per M4 conventions.

## 5. Data-Model Deltas

- `wa_contacts(phone_hash pk, phone_encrypted, lang en|ur-latn, opt_in_alerts bool, do_not_contact bool, first_seen, last_seen)`.
- `wa_sessions(contact_hash fk, state, flagged bool, updated_at)`.
- `wa_messages(wamid unique, contact_hash, direction in|out, intent, payload jsonb, created_at)` — 90-day purge.
- All service-role-only; console access via staff RPCs with masking (raw `phone_encrypted` decrypted solely inside the audited reveal RPC).

## 6. RLS & Privacy

No `anon`/`authenticated` access to any `wa_*` table (CI-probed). Phone numbers hashed for keys, encrypted-at-rest for reply routing only; transcripts masked by default with audited reveal; STOP semantics honored structurally (`do_not_contact` checked by any future outbound path as a hard gate); the privacy note is linked from About and the Privacy Policy's WhatsApp section governs. Inbound-only posture is an architectural property: **no code path capable of unsolicited sends exists in v1** — activation of outbound is a future PR against this PRD, not a config flip.

## 7. Edge Cases & Rules

Incoming media/voice/location → polite "text only for now" catalog line. Group-chat additions ignored (bot exits/never responds in groups). Double-tapped buttons → idempotent by wamid. Language switch mid-flow preserves state. A user who blocked the number simply goes silent (no retries, no error loops). FTS query < 2 chars → prompt for more. Meta webhook delivery storms → idempotency + queue-safe processing (each message handled once, in order per contact where feasible, out-of-order tolerated).

## 8. Analytics

Server-side aggregates from `wa_messages` (console §4.8) — sessions, intents, alert interest, flags. **Umami is not used** (no client surface, and phone-adjacent data stays out of the analytics store).

## 9. Acceptance Criteria (module gate — extends the master P4 gate)

1. Production-number E2E: greeting → both language paths → every menu flow, entirely user-initiated; the outbound log contains **zero** business-initiated sends.
2. Topic flow returns correct summary + link, with the video line present/absent per `primary_video_url` fixtures.
3. 24-hour memory boundary tested both sides (23:59 resumes; 24:01 greets fresh, language retained).
4. Alert registration sets the flag with the exact registration-not-activation copy; STOP → confirmation, flags cleared, later inbound still answered; START restores.
5. Handoff: reference code issued, session flagged, visible under the console filter; phone reveal writes the audit row.
6. Rate limit: 31st message in the hour receives the notice, 32nd receives nothing, all logged; wamid duplicate-delivery simulation processes once.
7. Kill-switch flips to the unavailable reply within one revalidation; 90-day purge proven clock-controlled; `wa_*` tables unreachable from any non-service credential.

## 10. Module Risks

- **R-M8a — Meta pricing/policy shift** (master R7): the phase gate re-verifies the free service-window economics before build; the kill-switch and inbound-only posture bound downside.
- **R-M8b — Roman-Urdu tone quality:** a stilted catalog reads worse than English-only. Native-speaker review of all `ur-latn` strings is a launch gate, revisited with real transcripts at week 2.
- **R-M8c — number health:** strict inbound-only behavior, no growth hacks, content-policy-clean replies; the dedicated number (M8-1) isolates any enforcement blast radius from the founders' own numbers.

## 11. Open Items

Outbound activation criteria (funding + volume — founder call, new PR against §6's hard gate). Urdu-script catalog. AI-assisted parsing (only ever via M3 §13's contract). Alert _sending_ design lives in a future revision once activation is real.

_End Module PRD 08 — the final module. Series complete: M1–M8, 47 MCQ answers, 51 recorded module decisions._
