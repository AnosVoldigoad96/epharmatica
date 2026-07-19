# ePharmatica

Learning & community platform for pharmacy — structured Pharm-D study material, BYOK AI study tools, forum, blog, jobs portal, and resume builder. One Next.js app, self-hosted Supabase, one VPS.

## Start here

| Doc | What |
|---|---|
| [`docs/epharmatica-docs-index.md`](docs/epharmatica-docs-index.md) | Reading order for the whole doc set |
| [`docs/development-plan.md`](docs/development-plan.md) | Phased build plan (you are in **Phase 0**) |
| [`docs/rules.md`](docs/rules.md) | Engineering ground rules — read before your first PR |
| [`docs/securities.md`](docs/securities.md) | Security program: RLS conventions, CI probes, limits, retention |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System topology + the ten load-bearing invariants |
| [`docs/STYLE.md`](docs/STYLE.md) | Design system v1.3 (locked) — Pharmacopoeia, 0px contract |

## Monorepo layout

```
apps/web              — the Next.js 16 app (all surfaces: public, learner, community, /admin)
packages/tokens       — @epharmatica/tokens: Style Dictionary source of truth → CSS @theme + TS
packages/ui           — @epharmatica/ui: shadcn-owned primitives + the 13 system primitives
packages/editor       — @epharmatica/editor: the Plate wrapper (only package touching slate*)
packages/database     — @epharmatica/database: generated Supabase types + shared Zod schemas
packages/config       — @epharmatica/config: shared tsconfig / ESLint / Prettier
supabase              — migrations (forward-only), RLS tests, seed
docs                  — PRDs, architecture, style, legal, plans
```

## Development

```sh
pnpm install
pnpm build          # turbo: tokens → ui → web
pnpm dev            # next dev (apps/web)
pnpm lint && pnpm typecheck && pnpm test
```

Node 22 LTS (`.nvmrc`) · pnpm 9 · Conventional Commits · trunk-based (`main` protected).
