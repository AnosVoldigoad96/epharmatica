# STYLE.md — ePharmatica Design System

> **Version 1.3 — LOCKED** · Resolves PRD Assumption **A7**. Companion: `style-specimen.html`.
> **In force:** Palette **Pharmacopoeia** · corner radius **0px** (the original boxy contract, restored in v1.2) · Archivo / Instrument Sans / IBM Plex Mono · signature: **monograph labels** · upgrades #1–#10 (v1.1), the mobile/touch system (v1.2), and the twelve-decision founder series S1–S12 (v1.3). All specimen and example copy is deliberately generic.

---

## 1. Design Direction

**1. Structure is the ornament.** No gradients, no glass, no shadowed cards. Beauty comes from labeled fields, hard rules, exact alignment, disciplined type. If a screen looks right with the color removed, the layout is right.

**2. Elegance through restraint.** One primary working hard; one signature element; whitespace spent generously. The only celebration in the product is the completion stamp (§7.3).

**3. Grounded, not decorated.** The system's vocabulary — monograph labels, blister grids, stamps, lot-code chips — comes from the discipline of reference texts and packaging, and encodes real structure. Sample copy in this document and the specimen stays generic; the product's own domain text conventions live in the CMS content style guide, not here.

### 1.1 The signature: Monograph Labels

IBM Plex Mono · 11px · 500 · UPPERCASE · +0.12em, above a **1px hard ink rule**. Used for section eyebrows, card headers, form labels, table headers, figure captions, sidebar groups, and metadata rows (`SEM 04`, `UPDATED 12 JUL 2026`, `REF 2026-0714`). It repeats everywhere; nothing else is allowed to be loud.

---

## 2. Shape Language — the 0px contract (restored)

| Token            | Value                                          | Applies to                                                                                                                                                                                          |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--radius` (all) | **0px — FINAL (S1)**                           | Everything: buttons, inputs, cards, images, chips, callouts, dialogs, popovers, toasts, skeletons, avatars, checkboxes, state glyphs. Founder-locked; changing this is a rebrand, not a token edit. |
| Hairline         | `1px solid var(--line)`                        | Default edge                                                                                                                                                                                        |
| Hard rule        | `1px solid var(--ink)`                         | Monograph labels, table-header underlines, key-panel top rules — hierarchy via rule _weight_                                                                                                        |
| Dose bar         | `2px` left edge                                | Callouts & blockquotes only                                                                                                                                                                         |
| Focus ring       | `2px solid var(--primary)`, offset 2px, square | Never a glow                                                                                                                                                                                        |

Radios are squares with a filled inner square; avatars are squares with mono-initial fallback; progress fills are square-ended. **The one permitted curve:** the capsule glyph inside the brand mark (§12) — it never leaks into UI chrome.

**Forbidden:** any border-radius, pills, circles, shadowed cards, gradients, emoji-as-icons.

---

## 3. Color — PHARMACOPOEIA (locked)

Semantic tokens only; raw hexes exist once, in `@theme` (§16).

| Token                    | Light                             | Dark                              | Role                                  |
| ------------------------ | --------------------------------- | --------------------------------- | ------------------------------------- |
| `paper`                  | `#FBFBF9`                         | `#0C1113`                         | App background                        |
| `surface`                | `#FFFFFF`                         | `#121A1C`                         | Cards, panels, inputs                 |
| `ink`                    | `#0C1418`                         | `#E7ECEC`                         | Primary text, hard rules              |
| `ink-2`                  | `#51606A`                         | `#93A4A8`                         | Secondary text                        |
| `line`                   | `#E3E7E8`                         | `#263135`                         | Hairlines                             |
| `primary`                | `#0E6B63`                         | `#4FB8AC`                         | CTAs, links, active, focus, selection |
| `primary-strong`         | `#0A5750`                         | `#6BCBC0`                         | Hover / pressed                       |
| `primary-tint`           | `#EAF4F2`                         | `#12302C`                         | Hover fills, callouts, selected rows  |
| `on-primary`             | `#FFFFFF`                         | `#0C1113`                         | Text on primary                       |
| `ok` / `warn` / `danger` | `#1E7A46` / `#9A6700` / `#B3261E` | `#4CB878` / `#D9A521` / `#E0655C` | Functional status only                |

**Highlighters (user layer only):** `hl-amber #FDE68A` · `hl-mint #BBEFDD` · `hl-lilac #DDD6FE` · `hl-rose #FBCFE8`; dark mode uses alpha overlays (`rgba(253,230,138,.26)` etc.). Text on highlights stays `ink`, always AA. The product never uses these for its own emphasis.

Rules: primary is punctuation, not wallpaper; status colors never decorate; metadata stays ink/mono. Contrast: primary on paper 6.3:1; all pairs AA both themes.

---

## 4. Typography

| Role               | Face                                           | Spec                                               |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| Display / headings | **Archivo** 600–700 (`wdth 125` wordmark only) | fluid scale in §6.2                                |
| Body / UI          | **Instrument Sans** 400/500                    | body 16/1.65 (max 68ch) · body-sm 14/1.55          |
| Utility / data     | **IBM Plex Mono** 400/500                      | label 11 UPPERCASE +.12em · data 13 `tabular-nums` |

Self-hosted via `next/font`. Sentence case except monograph labels; no UI italics; never letterspace lowercase; headings max two lines; numeric data always mono + tabular. Domain-specific naming/units/formatting rules belong to the CMS content style guide, not this document.

---

## 5. Layout, Density, Depth

- **8-pt grid** (4px sub-step). Section rhythm 96/64/40 desktop (see §6 for mobile); padding 24/16/12.
- **Gutters & container (S2–S3):** side gutters **20px** (<480px) → 24px (≥480) → 32px (≥768); content centers at a **1200px** max container (admin fluid to 1440px); reading column 68ch.
- **Blister grid (#1):** sibling items of equal weight (≥4) sit in shared collapsed 1px borders inside a 1px-framed container; hover/press = 1px ink inner outline + `primary-tint`. Column count responds to _container_ width (§6.1), not viewport.
- **Density (#10):** `comfortable` (40px controls) default; `compact` (32px, 13px tables) for admin only — never on touch (§6.3).
- **Depth:** flat; the one shadow `0 8px 24px rgba(12,20,24,.10)` (dark `.35`) on overlays only. Sticky headers/bars gain **no** scroll-shadow — a 1px hard rule and opaque `paper` do the separating.
- **Z-scale (#10):** `sticky 100 · dropdown 200 · overlay 300 · dialog 400 · toast 500`.
- **Motion:** 160ms `cubic-bezier(.2,.6,.2,1)`; 240ms overlays; opacity/transform only; **no page-to-page transitions — navigation is instant (S10)**; the 2px route bar and overlay fades are the only motion between views; `prefers-reduced-motion` → fades only, stamp instant.

---

## 6. Mobile & Touch System (v1.2)

Mobile is the primary reality for our audience — the system is designed at 360px first and enhanced upward.

### 6.1 Breakpoints & container queries

Viewport tokens: `sm 480 · md 768 · lg 1024 · xl 1200`. **Components respond to their container, not the viewport** (`container-type: inline-size` on grid/panel wrappers): the blister grid auto-fits `minmax(240px, 1fr)`, so it is correct inside a drawer, a dashboard column, or full width without media queries.

### 6.2 Fluid type

`display clamp(30px, 2rem + 2.6vw, 44px)` · `h1 clamp(25px, 1.5rem + 1.6vw, 32px)` · `h2 clamp(20px, 4.5vw, 24px)` · `h3 18/19` · body stays 16 (readability floor, and inputs at ≥16px prevent iOS focus-zoom). Line length still ≤68ch; on narrow screens the column is simply full-width minus 16–20px gutters.

### 6.3 Touch targets & pointer discipline

`@media (pointer: coarse)`: interactive targets ≥ **44px** (controls grow 40→44; list rows ≥48; icon buttons 44 with 20px glyphs); compact density is unavailable. Hover-only affordances are gated behind `@media (hover: hover)`; on touch, the same information must exist statically or on press. Pressed state = `primary-tint` fill via `:active` (no hover simulation), `-webkit-tap-highlight-color: transparent` since we draw our own.

### 6.4 Navigation

- **Top bar** 56px on mobile (64 desktop), hard 1px bottom rule, opaque; wordmark left, search + menu right.
- **Content tree** lives in a full-height left **drawer** (square, 1px right rule, the overlay shadow), opened from the bar; current location echoed as breadcrumb line under the bar.
- **Reader bottom action bar** (mobile only): fixed, 56px + safe-area, `surface` with 1px hard top rule; three verb actions — **Complete · Note · Assist** — icon over 10px mono label, primary fill on the active/emphasized one. Replaces floating action buttons; nothing floats in this system.

### 6.5 Reader on small screens

Subtopic sub-nav becomes a horizontally scrolling chip row (edge-faded, scroll-snap); the right-rail "on this page" TOC becomes a collapsed disclosure under the title (mono label `ON THIS PAGE`); prev/next become full-width paired blocks at the article end; media is full-bleed to the gutter with the 1px frame preserved.

### 6.6 Stacked monograph rows (responsive tables)

Below `sm`-container width, tables restructure instead of scroll: each record becomes a 1px-framed block of **label/value rows** — mono label (max 112px) left, value right, hairlines between — i.e., the monograph pattern _is_ the mobile table. Numeric comparison tables that must stay tabular may horizontally scroll inside a framed region with a 24px edge fade; choose one, never both.

### 6.7 Forms on touch

One column always; labels above (never floating); 16px input text; correct `inputmode`/`autocomplete` (`numeric` for codes, `email`, `search`); errors render below the field and scroll into view on submit; multi-step forms show a mono step line (`STEP 2 · 4`).

### 6.8 Selection & popover on touch

The select-text interaction (§11 · selection popover) listens to native selection on touch: on selection end, the popover docks as a **bottom sheet strip** above the action bar (48px, square, hard top rule) instead of floating at the caret — thumb-reachable, never covering the selected text.

### 6.9 Safe areas & PWA surface

Respect `env(safe-area-inset-*)` on the top bar, bottom action bar, and toasts; `viewport-fit=cover`; `theme-color` meta per theme (`#FBFBF9` / `#0C1113`); square-tile app icon from the brand mark (§12); standalone display styling verified (no browser chrome assumptions). Offline banner per §11.

### 6.10 Performance & stability

Long articles use `content-visibility: auto` with `contain-intrinsic-size` reservations; all media declare aspect-ratio (zero CLS budget stands on mobile); skeletons reserve true heights; the 200KB-gz reader JS budget (PRD §13.1) is measured at `sm`.

---

## 7. Learning-State Language

**Glyphs:** 12px squares — _not started_ 1px `line` outline · _in progress_ outline + left-half `primary` fill · _complete_ solid `primary`; always paired with text or `aria-label`. **Blister progress strip:** one glyph per unit, 2px gaps, replaces percentage bars in learning contexts. **Completion stamp:** on "Mark complete," the glyph fills and a mono chip fades in — `COMPLETED · 12 JUL` (Plex 10.5 +.1em, primary on `primary-tint`, 1px primary border) — 200ms, once, no confetti; persists as the completed chip. **Loading:** 1px-bordered skeleton blocks, opacity pulse 1.2s (no shimmer); 2px indeterminate primary bar for route transitions; **no spinners**.

---

## 8. Reading Experience

Square 6px list bullets; blockquotes carry the 2px dose bar + `ink-2` text; inline code/data in mono on `paper` with a 1px line; `<mark>` spans per §3 with a square-dot legend in "My Highlights." ****Content links (S6):** always underlined — 1px `primary` underline thickening to 2px on hover; color alone never signals a link in running text (navigation and buttons exempt). **Text size (S7):** an A− / A+ three-cell segmented control in the reader toolbar sets body 14/16/18px at 1.7/1.65/1.6 leading, persisted per user; UI chrome is unaffected. **Reading progress (S8):** a 2px `primary` bar fixed to the top of the reader viewport, transform-scaled by scroll, hidden when content fits one screen. **Progress strip (S9):** lives under the unit title only — the sub-nav never duplicates it. Print is a feature:** ink on white, chrome hidden, labels and rules retained, highlights become 1px underlines keyed by margin letters, URLs expanded as footnotes.

---

## 9. Figures & Diagrams

One-textbook rule for every author: line art only — `ink` 1.5px strokes with `primary` as the sole emphasis; Plex Mono 11px annotations; `surface` ground; 1px frame; caption in the monograph style (`FIG 04 · PROCESS OVERVIEW`). Photos (rare) take the same frame + caption. No 3D renders, no clip-art, no gradient diagrams. A Figma figure-kit ships in Phase 0.

---

## 10. Iconography

lucide · 20px grid · 1.5px stroke · **square caps, miter joins** globally. `ink`/`ink-2` unless _being_ a status; labeled (visible or `sr-only`) in navigation; 44px hit area on touch (§6.3); no decorative scatter.

---

## 11. Component Rules (shadcn overrides — all square)

- **Buttons** 40px (44 touch / 32 admin-compact): primary solid; secondary 1px ink border; ghost + tint hover/press. Verb-first labels.
- **Inputs** 40/44px, 1px line; focus = primary border + square ring; monograph labels; errors below in 13px `danger` text.
- **Cards/panels** surface + 1px line + 24px (16 on `sm`); optional monograph header; featured panels may take a 1px ink top rule.
- **Chips** 24px mono, ink-on-paper + 1px line (the semester chip is exactly this). Stamp chip per §7.
- **Verified badge** 12px ink square + `VERIFIED` mono label, 60% inline scale.
- **Callouts** dose bar + `primary-tint` + mono label; variant taxonomy comes from the PRD content model; `warn` bar for warnings.
- **Structured-record block** ("the monograph made literal"): mono labels left, values right, hairline rows, hard rules top/bottom — also the §6.6 mobile table target.
- **Tables** monograph headers over a hard rule; hairline rows; zebra admin-only; stack per §6.6.
- **Selection popover (new):** appears on text selection in the reader — square strip, `surface`, 1px ink border, the overlay shadow; actions as icon+label: **Highlight** (opens the 4-dot color row), **Note**, **Explain** (AI, only when a key is configured); caret-anchored on desktop, bottom-docked on touch (§6.8); Esc/blur dismisses; never obscures the selection.
- **Toasts (new):** bottom-center desktop / above the action bar on mobile; square, 1px line, one shadow; icon + one sentence + optional single action; 5s default, errors persist until dismissed; stack max 2.
- **Offline banner (new):** full-width strip under the top bar — `warn`-tinted, mono label `OFFLINE`, one sentence ("Changes will sync when you're back online."); reading continues, mutations queue or disable per feature.
- **Data-viz mini-rules (new):** dashboard charts use `ink` axes/hairline grids, `primary` as the single series color (`primary-strong` for comparison), square points, mono tick labels, no chart backgrounds or 3D — a chart is a figure (§9) and follows figure framing.
- **Landing hero (S4):** split composition — statement block (display line, one-sentence sub, brand mark, primary CTA + ghost “Join waitlist”) beside a **live demo of real system primitives** (blister grid or mini reader); stacks statement-first below `md`. No imagery beyond the system itself.
- **Waitlist form (S12):** email + module-of-interest select + role select (Student / Professional / Other); mono labels; one verb — “Join waitlist”; success replaces the form with a stamp chip (`ON THE LIST · 18 JUL`) — the completion-stamp language reused.
- **Nav / dialogs / empty states** as previously specified: 2px ink underline active links; square dialogs with the one shadow; empty state = label + sentence + action.

---

## 12. Brand Mark — the capsule in the box

`ink` **square** tile containing the white capsule at 45° with its seam — the system's one curve inside its boxy frame — beside `EPHARMATICA` in Archivo 700 `wdth 125`. Renders at 16/32/512; avatar-fallback frame; mono construction; `on-primary` reversal only.

---

## 13. Voice & Microcopy

Sentence case; plain verbs; specific over clever. Buttons say what happens ("Save note," "Mark complete" — never "Submit/OK") and keep their name through the flow ("Publish" → "Published"). Errors state what happened + how to fix it, no apologies, never vague. Empty states invite: label + one sentence + one action. Consistent vocabulary is the product's signposting.

---

## 14. Dark Mode & Forced Colors

Dark is first-class (system default + toggle): tokens §3; hard rules go near-white; primaries brighten with dark `on-primary`; highlight overlays per §3; never `#000` grounds or `#FFF` text; `theme-color` meta follows theme (§6.9). `forced-colors: active`: rely on system colors, keep 1px borders, swap tint-fills for outlines, border the state glyphs.

---

## 15. Accessibility Floor

AA minimums; visible square focus everywhere; targets ≥44px touch / ≥40px pointer; color never the sole signal; labels are real semantics; highlight colors named to AT; reduced-motion honored; print counts as a surface; keyboard map below.

**Keyboard shortcuts (desktop, new):** `?` opens the map · `⌘/Ctrl K` search · `[` `]` previous/next unit · `C` mark complete · `N` new note · `H` highlight selection · `Esc` dismiss. Shown in mono chips inside the `?` dialog; never required for any task.

---

## 16. Implementation (Tailwind v4 · locked tokens)

```css
@theme {
  --radius-*: 0px; /* the boxy contract */
  --color-paper: #fbfbf9;
  --color-surface: #ffffff;
  --color-ink: #0c1418;
  --color-ink-2: #51606a;
  --color-line: #e3e7e8;
  --color-primary: #0e6b63;
  --color-primary-strong: #0a5750;
  --color-primary-tint: #eaf4f2;
  --color-on-primary: #ffffff;
  --color-ok: #1e7a46;
  --color-warn: #9a6700;
  --color-danger: #b3261e;
  --color-hl-amber: #fde68a;
  --color-hl-mint: #bbefdd;
  --color-hl-lilac: #ddd6fe;
  --color-hl-rose: #fbcfe8;
  --font-display: 'Archivo', sans-serif;
  --font-sans: 'Instrument Sans', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;
  --breakpoint-sm: 480px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1200px;
  --z-sticky: 100;
  --z-dropdown: 200;
  --z-overlay: 300;
  --z-dialog: 400;
  --z-toast: 500;
}
.dark {
  /* dark values per §3 */
}
/* shadcn: --radius: 0rem. Grid wrappers: container-type:inline-size.
   Hover styles inside @media (hover:hover); touch sizing inside @media (pointer:coarse). */
```

System primitives in `components/system/*`: MonographLabel, BlisterGrid, StateGlyph, ProgressStrip, Stamp, SelectionPopover, ActionBar, StackedRecord, OfflineBanner, Toast, TextSizeControl, ReadingBar, WaitlistForm.

**System tooling (S11):** (1) **`/dev/system`** — an internal route rendering every primitive in both themes against live tokens (non-production / admin-gated); ships Phase 0 week one. (2) **Storybook** — one story per primitive, written incrementally; the deferrable half under time pressure. (3) **Style Dictionary** — `tokens/*.json` is the single source of truth, building the CSS `@theme`, TS constants, and a Tokens-Studio file for Figma; tokens are edited only in JSON. (4) **RTL conventions** from the first component: logical properties only (`ms-/me-/ps-/pe-`, `text-start/end`), no direction-baked assets, `dir` plumbed via next-intl, enforced via the review checklist.

---

## 17. Do / Don't

**Do:** design at 360px first · respond to containers, not viewports · keep every corner square · make progress a blister strip · dock the selection popover on touch · reserve media space (CLS 0) · gate hover behind `hover:hover`.
**Don't:** round anything · float action buttons · shadow on scroll · shimmer or spin · simulate hover on touch · let a table scroll _and_ stack · celebrate anything but completion.

---

## 18. Changelog

- **v1.3 (18 Jul 2026)** — Founder decision series S1–S12 locked: radius **finalized at 0px** (immutable) · gutters 20/24/32 with a 1200px container · split landing hero over live primitives · system-default theme · always-underlined content links · A−/A+ reader sizing · 2px reading-progress bar · title-anchored progress strip · instant navigation (no page transitions) · Phase-0 tooling adopted (`/dev/system`, Storybook, Style Dictionary → Figma tokens, RTL conventions) · waitlist expanded to email + module + role. New primitives: TextSizeControl, ReadingBar, WaitlistForm.

- **v1.2 (18 Jul 2026)** — Radius reverted to the original **0px** contract (5px experiment retired). **Mobile & touch system added** (§6): container-query components, fluid type, 44px coarse-pointer targets, drawer + reader bottom action bar, chip sub-nav + collapsible page TOC, stacked monograph-row tables, touch selection sheet, safe-area/PWA metadata, perf/CLS rules. New components: selection popover, toasts, offline banner, data-viz mini-rules; desktop keyboard map. All example copy genericized; domain text conventions delegated to the CMS content style guide.
- **v1.1** — Palette locked (Pharmacopoeia); 5px experiment; upgrades #1–#10 adopted.
- **v1.0** — Initial system: direction, monograph-label signature, four candidate palettes, 0px contract.
