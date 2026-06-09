# AGENTS.md

> App architecture context for mPriceGold (mGoldPrice). Supplements Hydra (`{RULES}` = `.cursor`); does NOT override Hydra agent process + `rules/*.mdc`.
> ⚠️ This is **Next.js server-side/serverless**, NOT React-Native/Flutter. Ignore Hydra mobile rules (Redux/Zustand/Navigation/Native/i18n).

## ARCH
- `src/app/`: App Router (web pages + API routes)
  - `src/app/api/**/route.ts`: API handlers — stores | price[/store] | history[/store] | cron | docs | openapi.json
  - `src/app/page.tsx` + `price-view.tsx`: Web SSR (server) + client poll 30s
  - `src/app/globals.css`: Tailwind v4 `@theme` (dark-only)
- `src/lib/`: domain/service layer (all logic here; routes only call)
  - `scrape.ts`: SINGLE SCRAPE SOURCE — `scrapeAndStore(cfg)` (one store) + `scrapeAllStores()` (all)
  - `stores.ts`: registry `STORES` + per-store parsers + `getStore()` / `DEFAULT_STORE`
  - `queries.ts`: cache→DB→decode reads — `getStores/getPrices/getHistories`
  - `cache.ts`: Upstash REST — `cacheGet/Set/Del` + `cacheLock` (SET NX EX = global cooldown)
  - `refresh.ts`: `triggerBackgroundRefresh()` — background scrape with cooldown (call via `after()`)
  - `encode.ts`: `encodeData/decodeData` base64 canonical JSON (deterministic)
  - `db/`: `schema.ts` (store, price_history) · `seed.ts` · `index.ts` (Neon + Drizzle)
  - `cors.ts` · `openapi.ts` (hand-written spec)
- Aliases: `@/*` → `src/*`
- Flow: thin route handler → `src/lib/*` service → DB/cache
- State: no client global state; data in Postgres + Upstash cache

## RULES
- file/dir: kebab-case | type/interface: PascalCase | fn/var: camelCase | const/env: UPPER | bool: is/has/can/should
- Keep route handlers THIN: parse → call service → return JSON. No scrape/read logic in routes
- Every route: `runtime="nodejs"` + `dynamic="force-dynamic"` + `OPTIONS()` + return `corsHeaders()`
- Scrape-all → ALWAYS `scrapeAllStores()` (single source). Never write a new scrape loop
- Background work → ALWAYS `after()` (next/server). Never fire-and-forget (Vercel freezes after response)
- Cooldown/lock → Redis `cacheLock`. Never module-level vars (per-instance RAM useless across instances)
- Reads → via `queries.ts` (cache-first). DB writes → via `scrapeAndStore` (to invalidate cache)
- Write matching: differs from latest row → INSERT; same → UPDATE updated_at. Changing it → must update `encode.ts` + docs
- Mobile API: don't change JSON shape without updating `MOBILE_API.md` + `openapi.ts`
- Error: try-catch scrape async; background scrape swallows + `console.error`; Redis errors swallowed → read DB
- TS: avoid `any`; use existing types (`GoldData`/`ScrapeAllItem`/`PriceEntry`...)

## FORBIDDEN
- fire-and-forget background work (async call without `after()`) → scrape dies mid-way
- cooldown via module-level var → use `cacheLock` (Redis)
- rewriting a scrape loop in a route/elsewhere → call `scrapeAllStores()`
- scrape/DB-read logic inside route handlers → push down to `src/lib/`
- socket/MQTT/SSE running ON Vercel (wrong serverless model; for push use an external service)
- forgetting `cacheDel` after DB write → API serves stale data
- hardcoding store list → read from `/api/stores` / `store` table
- changing `encode.ts` / insert-update logic without updating docs
- `git add -A` / bulk-commit outside scope

## BUILD
- `npm run dev` | `npm run build` | `npm start`
- `npx tsc --noEmit` (typecheck — no separate type-check script) | `npm test`
- `npm run db:generate` (migration on schema change) | `npm run db:migrate` | `npm run db:seed` (REAL DB WRITES)

## TEST
- framework: node:test (built-in) — `npm test`
- patterns: unit/round-trip in `src/lib/*.test.ts` (e.g. `encode.test.ts`)
- mock: no real network/DB in tests

## AGENT
- Pre-impl: read `PROJECT_CONTEXT.md` + relevant `src/lib/` files | non-trivial (≥50 LOC / ≥3 files / touches scrape-service/schema/API contract) → plan + verify first
- Read order: `PROJECT_CONTEXT.md` → `scrape.ts`/`stores.ts` → `queries.ts`/`refresh.ts`/`cache.ts` → relevant route
- Modify: read first | prefer edit over create | match patterns | verify: `npx tsc --noEmit` + `npm test`
- Bug: 1.reproduce via route 2.trace route→service 3.fix root in `src/lib` 4.re-check tsc+test
- Git: follow Prepare Commit Hard-Stop (see NOTE) — report-only until user confirms

## TASKS
### Add a new store (only 2 steps, touch nothing else)
1. Add entry to `STORES` (`src/lib/stores.ts`): `storeId/name/website/fetchData()` (HTML→cheerio; SPA→fetch JSON API)
2. Seed store row (`src/lib/db/seed.ts` → `npm run db:seed`, idempotent)

### Add scrape to another API
1. `import { triggerBackgroundRefresh } from "@/lib/refresh"` (polled route) or `scrapeAllStores` (cron-like)
2. `after(() => triggerBackgroundRefresh())` before returning response. Done.

### Feature
1. read PROJECT_CONTEXT + target 2. plan if non-trivial 3. types where used 4. logic in `src/lib/` 5. thin route calls service 6. update openapi/MOBILE_API if API changed 7. tsc+test

### Bug
1. trace route→service 2. fix root in `src/lib` 3. tsc+test

## DONE
- [ ] naming + thin route + logic in `src/lib/`
- [ ] `npx tsc --noEmit` clean | `npm test` pass
- [ ] background via `after()` | cooldown via `cacheLock`
- [ ] scrape-all via `scrapeAllStores()` | DB write has `cacheDel`
- [ ] no API shape change without `MOBILE_API.md`/`openapi.ts`
- [ ] no hardcoded stores | no socket/SSE on Vercel

## NOTE
- Language: user writes Vietnamese → reason/process **in English**, emit final **output in Vietnamese**. Code/docs: Vietnamese + English tech terms (keep repo style)
- Prepare Commit Hard-Stop: triggers `prepare commit`/`chuẩn bị commit` → REPORT-ONLY (only `git status`/`git diff`), NO `git add/commit/push` until user confirms; stage exact files, no `-A`
- Commit message: `{task_code} {fix|feat}: {summary}` (see README for Co-Authored-By format if needed)
