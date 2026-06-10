# CLAUDE.md — mPriceGold (mGoldPrice)

> **`{RULES}`** = Hydra root = `.cursor` (Layout A — Hydra cloned directly into `.cursor`, M-Studio standard per Hydra README).
> Full bootstrap copy (sync with §0): `{RULES}/example/HYDRA_BOOT_BLOCK.md`.
> After Step 0, on conflict: prefer Hydra agent + `{RULES}/rules/*.mdc` for process; root `AGENTS.md` supplements app context.
> ⚠️ This repo is **Next.js server-side/serverless** — NOT React-Native/Flutter. Hydra Routing Table is mobile-leaning; only use fitting agents (analyst-task, implementation, debugger-agent, code-review, api-contract, system-architecture, unittest, security-auditor, technical-writer).
> Language: user writes Vietnamese → reason/process **in English**, emit final **output in Vietnamese**.
> Last updated: 2026-06-09

---

## 0. Hydra System — REQUIRED

> Canonical copy: `{RULES}/example/HYDRA_BOOT_BLOCK.md`. Keep this §0 in sync when editing.

### STOP BEFORE DOING ANYTHING

This repo uses **Hydra** at `{RULES}/`. Every request must **go through routing**: read the agent definition, then execute.

#### STEP 0 (required)
1. Read `{RULES}/MANIFESTO.md`
2. Read `{RULES}/rules/base_rule.mdc`
3. Use the **Routing Table** in `HYDRA_BOOT_BLOCK.md` — pick agent(s)
4. Read the **full** agent file (and `depends_on` if any)
5. Read `{RULES}/departments/engineering/skills/skill-personal-rules.md` before implementing
6. Then code / main response

Skipping Step 0 → invalid output.

#### When no agent fits (HYDRA GAP)
Use default model, then print the `⚠️ HYDRA GAP DETECTED` block at end of response (template in `HYDRA_BOOT_BLOCK.md`). Note: Next.js backend often hits GAP since Hydra is mobile-oriented — propose a new agent via the template if it recurs.

#### Task size (before routing)
| Task | Workflow |
|---|---|
| <5 LOC, 1 file, no API/service/schema touch | nano — `pipeline/workflows/nano-workflow.md` |
| Clear root cause, moderate, no architecture touch | bugfix — `pipeline/workflows/bugfix.md` |
| Feature >50 LOC / ≥3 files / touches scrape-service/schema/API | feature — `pipeline/workflows/feature.md` |

---

## 1. Project Overview

**mPriceGold** — scrapes multi-store gold prices from websites → parse → store in Postgres → serve Web SSR + JSON API for a Flutter app.

- Runtime/framework: Next.js 16 App Router + TypeScript, Vercel serverless (Node, region `sin1`)
- Core domains: gold-price scraping, history storage, mobile API, web SSR
- Real-time/data mode: **NO realtime** — poll 30–60s (app) + cron 15m (external). No socket/SSE
- Environments: Vercel (Hobby) · Neon Postgres · Upstash Redis · cron-job.org

---

## 2. Tech Stack

| Layer | Library / Approach |
|---|---|
| Server | Next.js 16 App Router (route handlers + Server Components) |
| DB / ORM | Neon serverless Postgres + Drizzle ORM |
| Cache | Upstash Redis (REST) — read cache, invalidate on write |
| Scraping | cheerio (static HTML) or fetch JSON API per store |
| Styling | Tailwind v4 (CSS-first `@theme`), dark-only |
| Scraping | sync in `/api/cron` + `/api/refresh` (never on read) |
| Deploy | Vercel free; external cron 15m |

---

## 3. Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── stores/route.ts          # GET store list
│   │   ├── price/route.ts           # GET all prices (✅ background-scrapes all)
│   │   ├── price/[store]/route.ts   # GET one store (read-only)
│   │   ├── history/route.ts         # GET all history (read-only)
│   │   ├── history/[store]/route.ts # GET one store history (read-only)
│   │   ├── cron/route.ts            # GET synchronous scrape (CRON_SECRET)
│   │   ├── docs/route.ts            # Swagger UI
│   │   └── openapi.json/route.ts    # OpenAPI spec
│   ├── page.tsx + price-view.tsx    # Web SSR + client poll
│   └── globals.css
└── lib/
    ├── scrape.ts      # SINGLE SCRAPE SOURCE: scrapeAndStore + scrapeAllStores
    ├── stores.ts      # registry STORES + per-store parsers
    ├── queries.ts     # cache→DB→decode reads
    ├── cache.ts       # Upstash cache (get/set/del + keys)
    ├── encode.ts      # canonical base64 encode/decode
    ├── cors.ts · openapi.ts
    └── db/ (schema, seed, index)
```

Key files:
- `src/lib/scrape.ts` — single scrape source; scrape-all callers use `scrapeAllStores()`
- `src/lib/stores.ts` — add a store ONLY here (+ seed)
- `src/app/api/refresh/route.ts` — manual scrape-all (GET) → `scrapeAllStores()`; reads never scrape

---

## 4. Cursor / rule paths

- Hydra root: `{RULES}/` = `.cursor`
- Base rules: `{RULES}/rules/base_rule.mdc`
- Knowledge: `{RULES}/knowledge/lessons/`

Priority (after Step 0): root `AGENTS.md` (app context) > `{RULES}/rules/*` (process) > `.cursorrules` > `CLAUDE.md` / `PROJECT_CONTEXT.md`

---

## 5. Code Conventions

### Type System
- Avoid `any`; use existing types (`GoldData`/`StoreConfig`/`ScrapeAllItem`/`PriceEntry`/`StoreHistory`)
- Conditional ≥ 3 branches → map/dictionary instead of if-else/switch

### Server / Next.js
- Keep route handlers THIN: parse → call `src/lib/` service → return JSON. No logic in routes
- Every route: `runtime="nodejs"` + `dynamic="force-dynamic"` + `OPTIONS()` + `corsHeaders()`
- Scrape ONLY via `/api/cron` + `/api/refresh` (never on read/poll); reuse `scrapeAllStores()`

### Files
- Logic in `src/lib/`, not in routes. Scan `src/lib/` for existing helpers before writing new ones

### Commits / Git
- Never `git add -A` — stage exact files. Before commit: show full file list, wait for user confirm
- Run `npx tsc --noEmit` + `npm test` before finalizing

---

## 6. Critical Rules

### SCOPE_LOCK
Small request → do only that. No scope creep, no extra refactor.

### End-to-End
Agreed scope → implement fully; no "remaining parts..." TODOs.

### Blast Radius (touching shared layers)
- 🔴 CRITICAL: `src/lib/scrape.ts`, `src/lib/encode.ts`, `src/lib/db/schema.ts` → list affected API/flow; migration needed if schema changes
- 🟠 HIGH: `src/lib/queries.ts`, `src/lib/cache.ts`, `src/lib/stores.ts` → affects cache/scrape across routes
- 🟡 MEDIUM: one route handler, UI

### Guards
Add a store → only `stores.ts` + seed. Add scrape to API → only call the service. No sprawling edits.

---

## 7. Lessons Learned (Critical)

| # | Lesson | Rule |
|---|---|---|
| 1 | Scraping on every read/poll = too many DB writes | Scrape only via `/api/cron` + `/api/refresh`, never on read |
| 2 | DB write without invalidating cache serves stale data | After write, `cacheDel` price/history keys (done in `scrapeAndStore`) |
| 3 | Socket/SSE can't live on Vercel serverless | For <1s push use an external service, don't self-host on Vercel |
| 4 | Duplicated scrape logic in cron + price is hard to maintain | Single scrape source `scrapeAllStores()`; add stores only in `stores.ts` |

System lessons detail: `{RULES}/knowledge/lessons/`.

---

## 8. Documentation Default

User says "write doc" → default to repo style (`README.md`/`MOBILE_API.md`/`PROJECT_CONTEXT.md`, Markdown). Bilingual HTML only if explicitly requested.

---

## 9. Non-Trivial Task Protocol

Task ≥ 50 LOC / ≥ 3 files / touches scrape-service + schema + API contract:
1. Write spec/plan first
2. Save to `{RULES}/history/plans/{name}_{ts}.md` (or state the plan for user approval)
3. Verify with user before implementing

**Checklist before done:**
- [ ] `npx tsc --noEmit` clean
- [ ] `npm test` pass
- [ ] Thin route, logic in `src/lib/`
- [ ] Scrape only via cron/refresh, scrape-all `scrapeAllStores()`, DB write has `cacheDel`
- [ ] API change → update `MOBILE_API.md` + `openapi.ts`

---

## 10. Commands

```bash
npm run dev
npx tsc --noEmit
npm test
npm run db:migrate   # REAL DB WRITES
npm run db:seed      # REAL DB WRITES (idempotent)
```
