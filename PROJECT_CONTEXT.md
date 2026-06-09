# PROJECT_CONTEXT.md — AI Agent Reference

> Hydra root (`{RULES}`): `.cursor` (Layout A — Hydra cloned directly into `.cursor`, M-Studio standard).
> Filled manually for this **Next.js** repo (Hydra `example/` templates ship React-Native/Flutter defaults — they do NOT apply here).
> Purpose: let agents work effectively without scanning the whole repository.
> Project: **mPriceGold** (`mGoldPrice`)
> Stack: Next.js 16 App Router · TypeScript · Tailwind v4 · Drizzle ORM · Neon Postgres · Upstash Redis · Vercel (Hobby, region `sin1`).

---

## 1. Project Overview

- Domain: **multi-store gold-price scraping & serving**. Scrape store websites → parse → store in Postgres → serve Web SSR + JSON API for a Flutter app.
- Main features:
  - Periodic scrape (cron) + on-call scrape (app poll), storing price-change history.
  - Public JSON API (open CORS, no auth) for mobile: current prices + history + store list.
  - Dark-mode SSR web showing prices + history, with store filter.
- Auth: **reads are no-auth, CORS `*`**. Only `/api/cron` is protected by `CRON_SECRET` (header `x-cron-secret` or `Authorization: Bearer`).
- Platforms/envs: Vercel serverless (Node runtime, region Singapore `sin1`); Neon serverless DB; Upstash Redis REST cache; external cron (cron-job.org) every 15 min.

---

## 2. Tech Stack Decisions

> ⚠️ This is a **server-side / serverless** app, NOT mobile. No Redux/Zustand/Navigation/i18n/native. Don't apply Hydra's React-Native example rules.

### Server runtime — Next.js 16 App Router
- What: API route handlers (`src/app/api/**/route.ts`) + Server Components (SSR).
- Why: one codebase serves both web and API; deploys straight to Vercel.
- Pattern: every route `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`. Background work uses `after()` (next/server).

### Persistence — Neon Postgres + Drizzle ORM
- What: 2 tables `store`, `price_history`. Prices stored as an **encoded string** (base64 canonical JSON).
- Config: `DATABASE_URL` (Pooled connection). Access via `getDb()` (`src/lib/db`).
- Why: serverless-friendly; multi-store schema unchanged when adding stores.

### Cache / Lock — Upstash Redis (REST)
- What: read cache (`getStores/getPrices/getHistories`) + **global cooldown lock** for background scrape.
- Config: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Missing env → cache no-op (read DB directly).
- Why: REST fits serverless; `SET NX EX` lock prevents thundering herd when many clients poll.

### Async / background — `after()` + Redis cooldown
- Why: Vercel freezes the function right after the response → fire-and-forget dies mid-way.
- Pattern: background scrape runs in `after(() => triggerBackgroundRefresh())`; cooldown lives in Redis (not RAM).

---

## 3. Architecture Flow

### Standard Data Flow
```text
Store website ──fetchData()──> GoldData ──encodeData()──> price_history (Neon)
                                                             │ decodeData()
                                 ┌───────────────────────────┼───────────────────────────┐
                           SSR (page.tsx)              API GET (/api/price…)        (Upstash cache before DB)
                                 │                            │
                              HTML                         JSON ─────────────────> Flutter app (poll 30–60s)
```

### Refresh Flow (NO socket/realtime)
```text
Flow 1 (background): external cron 15m ─> GET /api/cron ─> scrapeAllStores()  [synchronous, no cooldown]
Flow 2 (poll):       app poll GET /api/price ─> after() ─> triggerBackgroundRefresh() ─> scrapeAllStores()  [Redis cooldown]
```

### Write decision (matching)
```text
fetchData -> encode -> compare with latest row for the store:
   DIFFERENT -> INSERT new row (a price change, into history)
   SAME      -> UPDATE that row (refresh updated_at only)
after DB write -> cacheDel(price:<store>, price:all, history:<store>, history:all)
```

---

## 4. Entry Point Map

### API routes (`src/app/api/**/route.ts`)
- `stores/route.ts` — GET store list.
- `price/route.ts` — GET all stores' prices (✅ background-scrapes all). `?store=` only filters the response.
- `price/[store]/route.ts` — GET one store (read-only).
- `history/route.ts`, `history/[store]/route.ts` — GET history (read-only).
- `cron/route.ts` — GET scrape-all (synchronous, needs `CRON_SECRET`). `?store=` scrapes one store manually.
- `docs/route.ts`, `openapi.json/route.ts` — Swagger UI + spec.

### Domain / service layer (`src/lib/`)
- Scrape: `scrape.ts` (`scrapeAndStore` + `scrapeAllStores`). Store registry: `stores.ts` (`STORES`).
- Reads: `queries.ts`. Cache: `cache.ts`. Encode: `encode.ts`. Background refresh: `refresh.ts`. DB: `db/`.

### Web FE
- Root: `src/app/page.tsx` (Server Component, SSR pre-reads data) + `src/app/price-view.tsx` (client, poll 30s).

---

## 5. Core Modules Summary

### Module Pattern
```text
Thin route handler -> calls service (src/lib/*) -> DB/cache. NO scrape/read logic embedded in routes.
Reads: always via queries.ts (cache-first). Writes: always via scrapeAndStore (to invalidate cache correctly).
```

### Most complex module
- Module: **scrape service** (`src/lib/scrape.ts` + `src/lib/stores.ts`).
- Why complex: parses different sources (static HTML via cheerio vs JSON API), insert/update matching, cache invalidation; it's the single scrape source for both cron and poll.
- Reference files: `src/lib/scrape.ts`, `src/lib/stores.ts`, `src/lib/encode.ts`, `src/lib/refresh.ts`.

---

## 6. Data Flow — Real Cases

### Flow 1: App opens the prices screen (poll)
1. App `GET /api/price` → route returns cache/DB data immediately (`getPrices`).
2. `after(() => triggerBackgroundRefresh())` runs AFTER the response: if Redis cooldown allows → `scrapeAllStores()` scrapes all stores.
3. Each store differing → INSERT, same → UPDATE; then invalidate cache. The app's next poll sees fresh data.

### Flow 2: Periodic cron (app not open)
1. cron-job.org `GET /api/cron` with `x-cron-secret` every 15 min.
2. Auth passes → `scrapeAllStores()` synchronously scrapes all stores, returns `{count, results}`.
3. Fresh data already in DB → ready the moment a user opens the app.

---

## 7. Critical Rules

### Architecture Rules
- **Single scrape source** = `scrapeAllStores()`. Any scrape-all caller reuses it; never write a new scrape loop.
- Reads **always via `queries.ts`** (cache-first); DB writes **always via `scrapeAndStore`** (invalidates cache).
- Background work on Vercel **always uses `after()`**, never fire-and-forget.
- Cooldown/lock **uses Redis (`cacheLock`)**, not module-level vars (per-instance RAM is useless).

### API Rules
- Keep route handlers thin; logic in `src/lib/`. Every route: `runtime=nodejs`, `dynamic=force-dynamic`, has `OPTIONS`, returns `corsHeaders()`.
- Don't change the JSON shape served to mobile without updating `MOBILE_API.md` + `src/lib/openapi.ts`.

### Content / Data Rules
- Don't change insert/update matching without updating `encode.ts` + docs.
- `buy/sell` are comma-formatted strings; `"0"`/`"-"` = not quoted.

### File Rules
- Add a store: edit ONLY `src/lib/stores.ts` (`STORES`) + seed `src/lib/db/seed.ts`. Don't touch routes/cron/refresh.
- Add scrape to another API: import & call the service (one line), don't copy logic.

---

## 8. Common Pitfalls

- Fire-and-forget background scrape (no `after()`) → frozen by Vercel, dies mid-way. **Always `after()`**.
- Module-level cooldown → useless across instances (thundering herd). **Use `cacheLock`**.
- Proposing socket/MQTT/SSE on Vercel → wrong serverless model (ruled out; for push use an external service).
- Forgetting `cacheDel` after a DB write → API serves stale data until TTL expires.
- Hardcoding the store list → always read from `/api/stores` / the `store` table.

---

## 9. Safe Modification Guide

### Safe to modify
- Add a store in `src/lib/stores.ts` + seed.
- UI `src/app/price-view.tsx`, `globals.css`.
- Docs: `README.md`, `MOBILE_API.md`, `PROJECT_CONTEXT.md`.

### Modify with care
- `src/lib/queries.ts` (cache keys must match `cache.ts` + invalidation in `scrape.ts`).
- `src/lib/openapi.ts` (must match the real response).
- Cooldown / `after()` in the price route.

### Never touch without full understanding
- `src/lib/encode.ts` (changing it breaks insert/update matching across all history).
- The insert/update logic in `scrapeAndStore`.
- Schema `src/lib/db/schema.ts` (needs a Drizzle migration).

---

## 10. Performance Strategy

- List rendering: SSR-ready HTML; client only polls for updates.
- Memoization: cache-first reads (Upstash TTL 600s), invalidate on write.
- Caching: Upstash Redis; cooldown lock prevents scrape pile-up.
- Real-time handling: **NO realtime** — poll 30–60s + cron 15m. Region `sin1` to sit near Neon/Upstash for lower latency.

---

## 11. File Priority Map

### Read first
1. `PROJECT_CONTEXT.md` (this file)
2. `src/lib/scrape.ts` (single scrape source)
3. `src/lib/stores.ts` (store registry + parsers)

### Read second
1. `src/lib/queries.ts` (cache/DB reads)
2. `src/lib/refresh.ts` + `src/lib/cache.ts` (background scrape + cooldown)
3. `src/app/api/price/route.ts` + `src/app/api/cron/route.ts`

### Read when needed
- `MOBILE_API.md` (mobile API contract), `src/lib/openapi.ts`
- `src/lib/encode.ts`, `src/lib/db/schema.ts`, `README.md`

---

## 12. Quick Reference

### Key services
| Name | File | Use for |
|---|---|---|
| `scrapeAllStores()` | `src/lib/scrape.ts` | Scrape all stores (single source) |
| `scrapeAndStore(cfg)` | `src/lib/scrape.ts` | Scrape one store + insert/update |
| `triggerBackgroundRefresh()` | `src/lib/refresh.ts` | Background scrape with cooldown (via `after()`) |
| `getPrices/getHistories/getStores` | `src/lib/queries.ts` | Cache-first reads |
| `cacheLock(key, ttl)` | `src/lib/cache.ts` | Global cooldown/lock |
| `STORES` | `src/lib/stores.ts` | Registry + per-store parsers |

### Key type imports
- `GoldData`, `GoldRow`, `StoreConfig` — from `@/lib/stores`
- `ScrapeResult`, `ScrapeAllItem` — from `@/lib/scrape`
- `PriceEntry`, `StoreHistory` — from `@/lib/queries`

### Essential commands
```bash
npm run dev          # local dev
npx tsc --noEmit     # typecheck (no separate type-check script)
npm test             # node test runner (encode round-trip)
npm run db:migrate   # migrate Neon (REAL DB WRITES)
npm run db:seed      # seed stores (idempotent, REAL DB WRITES)
```
