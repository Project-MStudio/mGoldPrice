# PROJECT_CONTEXT.md — AI Agent Reference

> Hydra root (`{RULES}`): `.cursor` (Layout A — Hydra clone thẳng vào `.cursor`, chuẩn M-Studio).
> Filled manually for this **Next.js** repo (the Hydra `example/` templates ship React-Native/Flutter defaults — they do NOT apply here).
> Purpose: enable agents to work effectively without scanning the whole repository.
> Project: **mPriceGold** (`mGoldPrice`)
> Stack summary: Next.js 16 App Router · TypeScript · Tailwind v4 · Drizzle ORM · Neon Postgres · Upstash Redis · Vercel (Hobby, region `sin1`).

---

## 1. Project Overview

- Domain: **Cào & phục vụ giá vàng đa tiệm** (multi-store gold price). Cào web tiệm vàng → parse → lưu Postgres → phục vụ Web SSR + API JSON cho app Flutter.
- Main features:
  - Cào giá định kỳ (cron) + cào on-call khi app poll, lưu lịch sử thay đổi giá.
  - API JSON công khai (CORS mở, không auth) cho mobile: giá hiện tại + lịch sử + danh sách tiệm.
  - Web dark-mode SSR hiển thị giá + lịch sử, có bộ lọc tiệm.
- Auth strategy: **API đọc không auth, CORS `*`**. Chỉ `/api/cron` được bảo vệ bằng `CRON_SECRET` (header `x-cron-secret` hoặc `Authorization: Bearer`).
- Platforms/environments: Vercel serverless (Node runtime, region Singapore `sin1`); DB Neon serverless; cache Upstash Redis REST; external cron (cron-job.org) 15 phút.

---

## 2. Tech Stack Decisions

> ⚠️ Đây là app **server-side / serverless**, KHÔNG phải mobile. Không có Redux/Zustand/Navigation/i18n/native. Đừng áp rule React-Native từ Hydra example.

### Server runtime — Next.js 16 App Router
- What: API route handlers (`src/app/api/**/route.ts`) + Server Components (SSR).
- Why: 1 codebase vừa serve web vừa serve API; deploy thẳng Vercel.
- Pattern: mọi route `export const runtime = "nodejs"`, `dynamic = "force-dynamic"`. Việc nền dùng `after()` (next/server).

### Persistence — Neon Postgres + Drizzle ORM
- What: 2 bảng `store`, `price_history`. Giá lưu dưới dạng **chuỗi đã encode** (base64 canonical JSON).
- Config: `DATABASE_URL` (Pooled connection). Truy cập qua `getDb()` (`src/lib/db`).
- Why: serverless-friendly, schema multi-store không đổi khi thêm tiệm.

### Cache / Lock — Upstash Redis (REST)
- What: cache đọc (`getStores/getPrices/getHistories`) + **cooldown lock global** cho cào nền.
- Config: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. Thiếu env → cache no-op (đọc thẳng DB).
- Why: REST hợp serverless; lock `SET NX EX` chống thundering herd khi nhiều client poll.

### Async / background — `after()` + Redis cooldown
- Why: Vercel freeze function ngay sau response → fire-and-forget chết giữa chừng.
- Pattern: cào nền chạy trong `after(() => triggerBackgroundRefresh())`; cooldown ở Redis (không phải biến RAM).

---

## 3. Architecture Flow

### Standard Data Flow
```text
Nguồn web tiệm ──fetchData()──> GoldData ──encodeData()──> price_history (Neon)
                                                              │ decodeData()
                                  ┌───────────────────────────┼───────────────────────────┐
                            SSR (page.tsx)              API GET (/api/price…)        (cache Upstash trước DB)
                                  │                            │
                               HTML                         JSON ─────────────────> App Flutter (poll 30–60s)
```

### Refresh Flow (KHÔNG socket/realtime)
```text
Flow 1 (nền): external cron 15p ─> GET /api/cron ─> scrapeAllStores()  [đồng bộ, không cooldown]
Flow 2 (poll): app poll GET /api/price ─> after() ─> triggerBackgroundRefresh() ─> scrapeAllStores()  [cooldown Redis]
```

### Write decision (so khớp)
```text
fetchData -> encode -> so với row mới nhất cùng store:
   KHÁC  -> INSERT row mới (1 lần đổi giá, vào lịch sử)
   GIỐNG -> UPDATE row đó (chỉ refresh updated_at)
sau ghi DB -> cacheDel(price:<store>, price:all, history:<store>, history:all)
```

---

## 4. Entry Point Map

### API routes (`src/app/api/**/route.ts`)
- `stores/route.ts` — GET danh sách tiệm.
- `price/route.ts` — GET giá tất cả tiệm (✅ cào nền tất cả). `?store=` chỉ lọc response.
- `price/[store]/route.ts` — GET giá 1 tiệm (chỉ đọc).
- `history/route.ts`, `history/[store]/route.ts` — GET lịch sử (chỉ đọc).
- `cron/route.ts` — GET cào tất cả (đồng bộ, cần `CRON_SECRET`). `?store=` cào thủ công 1 tiệm.
- `docs/route.ts`, `openapi.json/route.ts` — Swagger UI + spec.

### Domain / service layer (`src/lib/`)
- Cào: `scrape.ts` (`scrapeAndStore` + `scrapeAllStores`). Registry tiệm: `stores.ts` (`STORES`).
- Đọc: `queries.ts`. Cache: `cache.ts`. Encode: `encode.ts`. Refresh nền: `refresh.ts`. DB: `db/`.

### Web FE
- Root: `src/app/page.tsx` (Server Component, SSR đọc data sẵn) + `src/app/price-view.tsx` (client, poll 30s).

---

## 5. Core Modules Summary

### Module Pattern
```text
Route handler (mỏng) -> gọi service (src/lib/*) -> DB/cache. KHÔNG nhúng logic cào/đọc vào route.
Đọc: luôn qua queries.ts (cache-first). Ghi: luôn qua scrapeAndStore (để invalidate cache đúng).
```

### Most complex module
- Module: **scrape service** (`src/lib/scrape.ts` + `src/lib/stores.ts`).
- Why complex: parse nhiều nguồn khác nhau (HTML tĩnh cheerio vs API JSON), so khớp insert/update, invalidate cache; là nguồn cào DUY NHẤT cho cả cron lẫn poll.
- Reference files: `src/lib/scrape.ts`, `src/lib/stores.ts`, `src/lib/encode.ts`, `src/lib/refresh.ts`.

---

## 6. Data Flow — Real Cases

### Flow 1: App mở màn hình giá (poll)
1. App `GET /api/price` → route trả ngay data cache/DB (`getPrices`).
2. `after(() => triggerBackgroundRefresh())` chạy SAU response: cooldown Redis cho qua → `scrapeAllStores()` cào tất cả tiệm.
3. Mỗi tiệm khác giá → INSERT, giống → UPDATE; xong invalidate cache. Lần poll kế của app thấy data mới.

### Flow 2: Cron định kỳ (app chưa mở)
1. cron-job.org `GET /api/cron` kèm `x-cron-secret` mỗi 15 phút.
2. Auth pass → `scrapeAllStores()` cào đồng bộ tất cả tiệm, trả `{count, results}`.
3. Data tươi sẵn trong DB → user mở app là có ngay.

---

## 7. Critical Rules

### Architecture Rules
- **Nguồn cào DUY NHẤT** = `scrapeAllStores()`. Mọi nơi cần "cào hết" gọi lại nó; KHÔNG viết vòng loop cào mới.
- Đọc data **luôn qua `queries.ts`** (cache-first); ghi DB **luôn qua `scrapeAndStore`** (invalidate cache).
- Việc nền trên Vercel **luôn dùng `after()`**, không fire-and-forget.
- Cooldown/lock **dùng Redis (`cacheLock`)**, không biến module-level (RAM per-instance vô dụng).

### API Rules
- Route handler giữ mỏng; logic ở `src/lib/`. Mọi route: `runtime=nodejs`, `dynamic=force-dynamic`, có `OPTIONS`, trả `corsHeaders()`.
- Không đổi shape JSON đang phục vụ mobile mà chưa cập nhật `MOBILE_API.md` + `src/lib/openapi.ts`.

### Content / Data Rules
- Không đổi cách so khớp insert/update mà không cập nhật `encode.ts` + tài liệu.
- `buy/sell` là CHUỖI có dấu phẩy; `"0"`/`"-"` = không niêm yết.

### File Rules
- Thêm tiệm: CHỈ sửa `src/lib/stores.ts` (`STORES`) + seed `src/lib/db/seed.ts`. KHÔNG đụng route/cron/refresh.
- Thêm cào vào API khác: import & gọi service (1 dòng), không copy logic.

---

## 8. Common Pitfalls

- Fire-and-forget cào nền (không `after()`) → bị Vercel freeze, cào dở dang. **Luôn `after()`**.
- Cooldown bằng biến module-level → vô dụng đa-instance (thundering herd). **Dùng `cacheLock`**.
- Đề xuất socket/MQTT/SSE chạy trên Vercel → sai mô hình serverless (đã loại; cần push thì dùng dịch vụ ngoài).
- Quên `cacheDel` sau khi ghi DB → API trả data cũ tới khi TTL hết.
- Hardcode danh sách tiệm → luôn lấy từ `/api/stores` / bảng `store`.

---

## 9. Safe Modification Guide

### Safe to modify
- Thêm tiệm trong `src/lib/stores.ts` + seed.
- UI `src/app/price-view.tsx`, `globals.css`.
- Doc: `README.md`, `MOBILE_API.md`, `PROJECT_CONTEXT.md`.

### Modify with care
- `src/lib/queries.ts` (cache key phải khớp `cache.ts` + invalidate trong `scrape.ts`).
- `src/lib/openapi.ts` (phải khớp response thật).
- Cooldown / `after()` trong route price.

### Never touch without full understanding
- `src/lib/encode.ts` (đổi là vỡ so khớp insert/update toàn bộ lịch sử).
- Logic insert/update trong `scrapeAndStore`.
- Schema `src/lib/db/schema.ts` (cần migration Drizzle).

---

## 10. Performance Strategy

- List rendering: SSR sẵn HTML; client chỉ poll cập nhật.
- Memoization: cache-first đọc (Upstash TTL 600s), invalidate khi ghi.
- Caching: Upstash Redis; cooldown lock chống cào dồn.
- Real-time handling: **KHÔNG realtime** — poll 30–60s + cron 15p. Region `sin1` để gần Neon/Upstash giảm latency.

---

## 11. File Priority Map

### Read first
1. `PROJECT_CONTEXT.md` (file này)
2. `src/lib/scrape.ts` (nguồn cào duy nhất)
3. `src/lib/stores.ts` (registry tiệm + parser)

### Read second
1. `src/lib/queries.ts` (đọc cache/DB)
2. `src/lib/refresh.ts` + `src/lib/cache.ts` (cào nền + cooldown)
3. `src/app/api/price/route.ts` + `src/app/api/cron/route.ts`

### Read when needed
- `MOBILE_API.md` (hợp đồng API mobile), `src/lib/openapi.ts`
- `src/lib/encode.ts`, `src/lib/db/schema.ts`, `README.md`

---

## 12. Quick Reference

### Key instances/services
| Name | File | Use for |
|---|---|---|
| `scrapeAllStores()` | `src/lib/scrape.ts` | Cào tất cả tiệm (nguồn duy nhất) |
| `scrapeAndStore(cfg)` | `src/lib/scrape.ts` | Cào 1 tiệm + insert/update |
| `triggerBackgroundRefresh()` | `src/lib/refresh.ts` | Cào nền có cooldown (qua `after()`) |
| `getPrices/getHistories/getStores` | `src/lib/queries.ts` | Đọc data cache-first |
| `cacheLock(key, ttl)` | `src/lib/cache.ts` | Cooldown/lock global |
| `STORES` | `src/lib/stores.ts` | Registry + parser từng tiệm |

### Key type imports
- `GoldData`, `GoldRow`, `StoreConfig` — from `@/lib/stores`
- `ScrapeResult`, `ScrapeAllItem` — from `@/lib/scrape`
- `PriceEntry`, `StoreHistory` — from `@/lib/queries`

### Essential commands
```bash
npm run dev          # dev local
npx tsc --noEmit     # typecheck (KHÔNG có script type-check riêng)
npm test             # node test runner (encode round-trip)
npm run db:migrate   # migrate Neon (GHI DB THẬT)
npm run db:seed      # seed store (idempotent, GHI DB THẬT)
```
