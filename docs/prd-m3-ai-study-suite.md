# Module PRD 03 — AI Study Suite (BYOK)

| | |
|---|---|
| **Module** | AI Study Suite — Explain · Summarize · Chat, on user-supplied keys |
| **Version** | 1.0 · 18 Jul 2026 |
| **Parents** | Master PRD v1.5 (§7.5) · ARCHITECTURE.md v1.1 (AI flow, I6) · STYLE.md v1.3 (selection popover) |
| **Decisions** | M3-1 … M3-6 + two rider decisions — see §2 |
| **Phase** | 1 |

## 1. Scope

**In:** the three learner-facing AI features, provider/model selection, key management UX (over the master PRD's storage architecture), spend guardrails, failure handling, the streaming proxy contract, and grounding/prompt contracts. **Out:** any platform-paid inference (never exists, G3), WhatsApp NLU (M8, menu-driven by design), resume AI polish (M7 — *reuses* this module's proxy, guardrails, and adapters under the contract in §13), model-registry admin surface (M4 renders it; schema defined here).

## 2. Module Decision Log

| # | Decision | Choice | Consequence |
|---|---|---|---|
| M3-1 | Model selection | **Curated shortlist + advanced custom-ID field** | DB-driven `ai_models` registry (§4.1) keeps shortlists fresh without deploys; custom IDs accepted per provider with an "unvalidated" note. |
| M3-2 | Chat context | **Current subtopic by default + "Include whole topic" toggle** | Token-estimate shown before enabling the toggle; user pays, user chooses (§4.5). |
| M3-2r | Rider | **Selection → chat** entry point ("Ask AI" in the popover) | Selected text is piped into the chat as quoted context — distinct from one-shot Explain (§4.5). |
| M3-3 | Chat persistence | **sessionStorage** (survives reload, dies with the tab) | Keyed per subtopic; explicit Clear action; nothing server-side (§4.5). |
| M3-3r | Rider | **Save answer to notes** | Any assistant response can become a note with a permanent `AI` source label, preserved in the M2 export (§4.6). |
| M3-4 | Spend guardrails | **Conservative, adjustable** — 1,024 tok/response · 100 req/day defaults | Platform-enforced caps on the user's behalf; bounds in §4.7. |
| M3-5 | Failure behavior | **Inline error + one-tap provider/model switch** | Normalized error taxonomy → recovery sheet (§4.8). |
| M3-6 | Explain quick-actions | **Simpler · Example · Mnemonic · Quiz me** | "Quiz me" = 1–2 tap-to-reveal check questions; a taste of Phase-5 assessments at zero platform cost (§4.3). |

## 3. User Stories

1. As a student with a free Groq key, I paste it once, it's validated instantly, and every AI feature just works — on this device only unless I opt into sync.
2. I select a confusing sentence — or a table row — tap **Explain**, and get a grounded answer; one more tap gives me a mnemonic or a quick quiz on it.
3. I open the chat, ask questions about the subtopic I'm reading, and when my question spans the whole topic I flip one toggle, seeing what it'll roughly cost me first.
4. I select a phrase and **Ask AI** about it in chat, with my selection quoted so the model knows exactly what I mean.
5. When an answer is worth keeping, one tap saves it to my notes — clearly labeled as AI, forever distinguishable from my own thinking.
6. My key runs out of quota mid-session; I see exactly what happened and switch to my other provider in one tap without losing the chat.
7. The platform stops me before a bug (or my own enthusiasm) burns my daily budget — and lets me raise the limits deliberately in Settings.

## 4. Functional Specification

### 4.1 Providers & the model registry (M3-1)
Providers: **OpenAI · Anthropic · Google Gemini · OpenRouter · Groq** via the Vercel AI SDK adapters behind the internal `AiProvider` interface (ARCH §5). **`ai_models` registry** (admin-edited in M4, no deploys): `provider, model_id, label, tier_note ("fast"/"strong"/"free-tier friendly"), is_default, active, sort`. The picker shows active registry models grouped by configured provider, default preselected; an **Advanced** disclosure exposes a per-provider custom model-ID input (`family/model` free text) flagged *"Custom IDs aren't validated and may fail — errors will offer a switch."* Selection persists in `profiles.prefs.ai`.

### 4.2 Key management — `/settings/ai-keys`
Per-provider rows: status (none / device-only / synced), masked tail (`····k3Jq`), Validate again, Remove. **Storage modes** per master §7.5.4 — *This device only* (default; IndexedDB) and *Sync across devices* (sealed-box encrypted server-side) — switchable per provider (switching to device-only deletes the server copy immediately). **Validation on save:** a minimal 1-token completion through the proxy; failures block save with the normalized error (§4.8). Onboarding order & "get a key in 2 minutes" guides surface **Groq and Gemini first** (free tiers; verify current terms at build). Multiple providers may hold keys simultaneously; the AI panel header shows the active provider · model with a switcher.

### 4.3 Explain (one-shot, from the selection popover)
Grounding context = the selected text + its containing block + one sibling block either side (via the `lib/editor` run API — same anchors machinery as highlights). Response renders in a popover (desktop) / sheet (touch) as markdown with the persistent disclaimer footer. **Quick actions** re-prompt with identical grounding: **Simpler** (plainer register) · **Example** (one concrete worked example) · **Mnemonic** (one memorable device) · **Quiz me** — 1–2 short check questions whose answers render collapsed behind tap-to-reveal cells (square, of course). Every response offers **Save to notes** (§4.6) and **Ask in chat** (carries selection + response into §4.5).

### 4.4 Summarize (subtopic-level)
One tap in the AI panel → structured summary of the current subtopic under fixed monograph-labeled sections: **KEY POINTS** (≤6 bullets) · **MUST-KNOW TERMS** (term — one line) · **EXAM ANGLES** (≤3). Prompt contract pins this shape (§5); output max = the user's response cap. Save-to-notes available.

### 4.5 Chat panel (M3-2, M3-2r, M3-3)
Entry: **Assist** (action bar / toolbar) or **Ask AI** from the selection popover (message pre-filled with the selection as a quoted block). **Context scope:** current subtopic serialized to Markdown (title + full content, gated-safe: signed-in only by construction). The **"Include whole topic"** toggle concatenates all *published* sibling subtopics; before enabling, the UI shows `≈ {chars/4} tokens of context — larger requests cost more on your key`; the toggle state persists with the chat. Hard guard: estimated context > 150k characters disables the toggle with an explanatory note. **System prompt** enforces strict grounding (answer only from the provided material; say plainly when it isn't there; educational aid, not medical advice — see §5). Streaming SSE with a **Stop** button (abort propagates to the provider); one concurrent stream per user (a second request queues client-side). **History:** `sessionStorage["ai-chat:{subtopic_id}"]` — messages + scope toggle; survives reload, dies with the tab; **Clear chat** wipes it; navigating between subtopics switches cleanly (each has its own key).

### 4.6 Save to notes (M3-3r)
Any assistant message → **Save to notes** creates a free subtopic note: content = the response (markdown→Plate), plus `source: 'ai'` and `source_label: '{provider} · {model}'`. Rendering: the note carries a small `AI` chip in the drawer and inline lists; the M2 export gains a `source` field on notes (`"user" | "ai"`, with `source_label`). AI notes are editable — first edit keeps the chip (provenance is about origin, not purity).

### 4.7 Spend guardrails (M3-4)
Platform-enforced, per user, protecting the user's own wallet: **max output tokens per response — default 1,024** (adjustable 256–4,096) and **daily request cap — default 100** (adjustable 20–500; "unlimited" deliberately not offered), alongside the master burst limit (30 requests / 5 min). Counters live in `ai_rate_limits` (user, day, count — no content, ever). Hitting the daily cap: *"You've reached your daily AI limit (100). It resets at midnight — or raise it in Settings."* Output-cap truncation appends a visible `— response reached your length limit (Settings → AI)` marker. Settings → AI keys hosts both sliders with plain-language cost framing.

### 4.8 Failure behavior (M3-5) — normalized error taxonomy
The proxy maps every provider error to one of: `invalid_key` · `quota_exceeded` · `model_not_found` · `provider_rate_limited` · `content_filtered` · `network` · `unknown`. Each renders an inline error card (STYLE voice: what happened + how to fix it) plus a **recovery sheet**: switch model (registry shortlist) · switch provider (any provider with a configured key) · retry. `invalid_key` deep-links to `/settings/ai-keys`; `content_filtered` explains provider-side filtering without blame; chat history is never lost by a failure. Custom-ID `model_not_found` additionally offers "use {provider default} instead."

### 4.9 Proxy contract (recap + specifics)
`POST /api/ai` — body: `{ feature: explain|summarize|chat|quiz, provider, model, scope, messages|target, max_tokens }`; key resolution per master §7.5.4 (header in device-only mode; transient decrypt in sync mode); response = SSE stream; abort honored end-to-end. **No prompts, keys, or outputs are logged** (I6): the route uses a scrubbed logger emitting only `{user_hash, feature, provider, duration_ms, error_kind}`. Output is rendered as markdown text only — never executed, no tools, no links auto-fetched (prompt-injection posture per master §13.2).

## 5. Prompt Contracts (sketch — final copy is code-reviewed, not CMS-edited)
- **Grounding preamble (all):** *"You are a study assistant inside ePharmatica. Answer ONLY from the provided material. If the material doesn't contain the answer, say so plainly. You are an educational aid, not a source of medical advice; do not give patient-specific guidance."*
- **Explain:** material = selection + surrounding blocks; "Explain the selected passage for a university student in ≤180 words." Quick-action modifiers append one line each (simpler register / one worked example / one mnemonic / "write 1–2 short check questions with answers, answers last").
- **Summarize:** fixed three-section output shape (§4.4), "use only the material."
- **Chat:** preamble + material + rolling messages; the whole-topic variant swaps the material block only.

## 6. Data-Model Deltas
- **add** `ai_models(provider, model_id, label, tier_note, is_default, active, sort)` — public read, admin write (M4 surface).
- `ai_rate_limits(user_id, day, count)` + burst window rows (master).
- `profiles.prefs.ai jsonb`: `{ default_provider, default_model, custom_models: {provider: id}, max_tokens, daily_cap }`.
- `user_notes` **add** `source text default 'user'`, `source_label text null` (feeds M2 export).
- `ai_keys` unchanged from master (provider, encrypted_key nullable, storage_mode, last_validated_at).

## 7. RLS & Access Shape
`ai_models`: anon/auth select where `active`, service write. **`ai_keys`: no direct PostgREST access at all** — RLS denies select/insert/update to `authenticated`; all operations go through `security definer` RPCs (`ai_key_status()` returns provider+mode+masked tail only; `ai_key_store/validate/remove`) so the encrypted blob never crosses the API even to its owner (defense-in-depth for I6). `ai_rate_limits`: owner select (for the Settings meter), service write. CI RLS tests: *authenticated cannot select `ai_keys`*, *status RPC returns masked only*, *user cannot edit another's prefs*, *anon cannot invoke the proxy*.

## 8. Privacy & Security Notes
Keys request-scoped in memory; Sentry `beforeSend` + pino redaction lists cover `authorization`, `x-provider-key`, message bodies; sessionStorage history never syncs; the daily counter stores counts, not content; CSP disallows browser→provider calls (proxy-only by construction). Deleting an account purges `ai_keys` first (M2 §4.7) and the prefs die with the profile row.

## 9. Edge Cases & Rules
Registry model deactivated while set as a user default → next request falls back to the provider default with an inline notice. Whole-topic toggle with unpublished siblings → published only (M1-6 consistency). Switching subtopics mid-stream aborts the stream (state is per-subtopic). Two tabs, same subtopic → last-write-wins on sessionStorage (accepted). Key removed in Settings while a chat is open → next send hits `invalid_key` recovery. Quiz-me answers are collapsed by default and never auto-revealed by screen readers without activation (proper disclosure semantics). Explain on an orphaned highlight's snapshot is not offered (no live anchor).

## 10. Analytics Events (Umami — counts only)
`ai_key_saved` (provider, mode) · `ai_explain_used` · `ai_quick_action` (kind) · `ai_summary_used` · `ai_chat_message` (scope: subtopic|topic, entry: panel|selection) · `ai_saved_to_note` · `ai_error` (kind) · `ai_recovery_switch` (to: model|provider) · `ai_cap_hit` (kind: daily|output) · `ai_toggle_topic_scope`.

## 11. Acceptance Criteria (module gate)
1. End-to-end streaming (start · stream · abort) proven against **two live providers** plus a mock; recovery sheet switches provider mid-chat without history loss.
2. Both key-storage modes verified; switching sync→device deletes the server blob (DB-checked); `ai_keys` unreachable via PostgREST as per §7.
3. Explain works from every highlightable block kind's selection (shares M1 fixtures); all four quick actions return; Quiz-me reveals behave accessibly.
4. Whole-topic toggle shows the estimate, respects the 150k guard, and demonstrably changes the context payload.
5. Selection→chat quotes the selection; Save-to-notes produces an `AI`-chipped note that round-trips through the M2 export with `source` fields.
6. Caps: output truncation marker appears at the configured limit; daily cap blocks with the correct copy and resets on day boundary (clock-controlled test).
7. Log audit fixture: a full session produces zero occurrences of key material or message content in pino output and Sentry events.
8. sessionStorage lifecycle: reload preserves, tab close clears, Clear chat clears, per-subtopic isolation holds.

## 12. Module Risks
- **R-M3a — model churn:** registry + custom IDs + default-fallback (§4.1, §4.9) make model turnover an admin edit, not a release.
- **R-M3b — provider behavior variance** (filters, error shapes): taxonomy quarantines it (§4.8); adapters carry per-provider mapping tables with contract tests against recorded fixtures.
- **R-M3c — cost anxiety/complaints:** conservative defaults, pre-send estimates, visible caps, and the truncation marker keep spend legible; support macro prepared.

## 13. Contracts Exported to Other Modules
**M7 (Resume polish):** calls the same proxy with `feature: 'polish'`, inherits guardrails/taxonomy; its prompts live in M7. **M8 (WhatsApp):** no LLM in v1 by decision; if AI parsing ever lands, it must route through these adapters under a platform-owned key policy decided then. **M4:** renders the `ai_models` registry editor and the module's admin analytics.

*End Module PRD 03 · decisions M3-1…M3-6 (+2 riders) locked · next: M4 CMS / Admin.*
