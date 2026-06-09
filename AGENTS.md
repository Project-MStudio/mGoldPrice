# AGENTS.md

> App architecture context cho mPriceGold (mGoldPrice). Bổ sung context cho Hydra (`{RULES}` = `.cursor`), KHÔNG override process của agent Hydra + `rules/*.mdc`.
> ⚠️ Đây là **Next.js server-side/serverless**, KHÔNG phải React-Native/Flutter. Bỏ qua rule mobile (Redux/Zustand/Navigation/Native/i18n) trong Hydra example.

## ARCH
- `src/app/`: App Router (web pages + API routes)
  - `src/app/api/**/route.ts`: API handlers — stores | price[/store] | history[/store] | cron | docs | openapi.json
  - `src/app/page.tsx` + `price-view.tsx`: Web SSR (server) + client poll 30s
  - `src/app/globals.css`: Tailwind v4 `@theme` (dark-only)
- `src/lib/`: domain/service layer (logic nằm hết ở đây, route chỉ gọi)
  - `scrape.ts`: NGUỒN CÀO DUY NHẤT — `scrapeAndStore(cfg)` (1 tiệm) + `scrapeAllStores()` (tất cả)
  - `stores.ts`: registry `STORES` + parser từng tiệm + `getStore()` / `DEFAULT_STORE`
  - `queries.ts`: đọc cache→DB→decode — `getStores/getPrices/getHistories`
  - `cache.ts`: Upstash REST — `cacheGet/Set/Del` + `cacheLock` (SET NX EX = cooldown global)
  - `refresh.ts`: `triggerBackgroundRefresh()` — cào nền có cooldown (gọi qua `after()`)
  - `encode.ts`: `encodeData/decodeData` base64 canonical JSON (deterministic)
  - `db/`: `schema.ts` (store, price_history) · `seed.ts` · `index.ts` (Neon + Drizzle)
  - `cors.ts` · `openapi.ts` (spec viết tay)
- Aliases: `@/*` → `src/*`
- Flow: Route handler (mỏng) → service `src/lib/*` → DB/cache
- State: KHÔNG có client global state; data ở Postgres + cache Upstash

## RULES
- file/dir: kebab-case | type/interface: PascalCase | fn/var: camelCase | const/env: UPPER | bool: is/has/can/should
- Route handler giữ MỎNG: parse → gọi service → trả JSON. Logic cào/đọc KHÔNG nhúng vào route
- Mọi route: `runtime="nodejs"` + `dynamic="force-dynamic"` + `OPTIONS()` + trả `corsHeaders()`
- Cào hết → LUÔN `scrapeAllStores()` (nguồn duy nhất). Không viết loop cào mới
- Việc nền → LUÔN `after()` (next/server). KHÔNG fire-and-forget (Vercel freeze sau response)
- Cooldown/lock → Redis `cacheLock`. KHÔNG biến module-level (RAM per-instance vô dụng đa-instance)
- Đọc → qua `queries.ts` (cache-first). Ghi DB → qua `scrapeAndStore` (để invalidate cache đúng)
- So khớp ghi: khác row mới nhất → INSERT; giống → UPDATE updated_at. Đổi → phải sửa `encode.ts` + doc
- API mobile: không đổi shape JSON mà chưa cập nhật `MOBILE_API.md` + `openapi.ts`
- Error: try-catch async cào; cào nền nuốt lỗi + `console.error`; lỗi Redis nuốt → đọc thẳng DB
- TS: tránh `any`; dùng type sẵn có (`GoldData`/`ScrapeAllItem`/`PriceEntry`...)

## FORBIDDEN
- fire-and-forget việc nền (gọi async không `after()`) → cào dở dang
- cooldown bằng biến module-level → dùng `cacheLock` (Redis)
- viết lại loop cào ở route/nơi khác → gọi `scrapeAllStores()`
- nhúng logic cào/đọc DB vào route handler → đẩy xuống `src/lib/`
- socket/MQTT/SSE chạy TRÊN Vercel (sai mô hình serverless; cần push thì dịch vụ ngoài)
- quên `cacheDel` sau khi ghi DB → API trả data cũ
- hardcode danh sách tiệm → lấy từ `/api/stores` / bảng `store`
- đổi `encode.ts` / logic insert-update mà chưa cập nhật doc
- `git add -A` / bulk-commit ngoài scope

## BUILD
- `npm run dev` (dev) | `npm run build` | `npm start`
- `npx tsc --noEmit` (typecheck — KHÔNG có script type-check riêng) | `npm test`
- `npm run db:generate` (migration khi đổi schema) | `npm run db:migrate` | `npm run db:seed` (GHI DB THẬT)

## TEST
- framework: node:test (built-in) — `npm test`
- patterns: round-trip/đơn vị ở `src/lib/*.test.ts` (vd `encode.test.ts`)
- mock: không gọi network/DB thật trong test

## AGENT
- Pre-impl: đọc `PROJECT_CONTEXT.md` + file `src/lib/` liên quan | non-trivial (≥50 LOC / ≥3 file / đổi service-scrape/schema/API contract) → plan + verify trước
- Read order: `PROJECT_CONTEXT.md` → `scrape.ts`/`stores.ts` → `queries.ts`/`refresh.ts`/`cache.ts` → route liên quan
- Modify: đọc trước | ưu tiên sửa hơn tạo mới | match pattern | verify: `npx tsc --noEmit` + `npm test`
- Bug: 1.tái hiện qua route 2.trace route→service 3.fix gốc ở `src/lib` 4.kiểm lại tsc+test
- Git: theo Prepare Commit Hard-Stop (xem NOTE) — report-only tới khi user xác nhận

## TASKS
### Thêm tiệm mới (chỉ 2 bước, KHÔNG đụng đâu khác)
1. Thêm entry vào `STORES` (`src/lib/stores.ts`): `storeId/name/website/fetchData()` (HTML→cheerio; SPA→fetch API JSON)
2. Seed row store (`src/lib/db/seed.ts` → `npm run db:seed`, idempotent)

### Thêm cào vào 1 API khác
1. `import { triggerBackgroundRefresh } from "@/lib/refresh"` (route bị poll) hoặc `scrapeAllStores` (cron-like)
2. `after(() => triggerBackgroundRefresh())` trước khi trả response. Hết.

### Feature
1. đọc PROJECT_CONTEXT + target 2. plan nếu non-trivial 3. type ở chỗ dùng 4. logic ở `src/lib/` 5. route mỏng gọi service 6. cập nhật openapi/MOBILE_API nếu đổi API 7. tsc+test

### Bug
1. trace route→service 2. fix gốc ở `src/lib` 3. tsc+test

## DONE
- [ ] naming + route mỏng + service ở `src/lib/`
- [ ] `npx tsc --noEmit` sạch | `npm test` pass
- [ ] việc nền qua `after()` | cooldown qua `cacheLock`
- [ ] cào hết qua `scrapeAllStores()` | ghi DB có `cacheDel`
- [ ] không đổi shape API mà quên `MOBILE_API.md`/`openapi.ts`
- [ ] không hardcode tiệm | không socket/SSE trên Vercel

## NOTE
- User comms: tiếng Việt | code/docs: tiếng Việt + thuật ngữ tiếng Anh (giữ style repo)
- Prepare Commit Hard-Stop: trigger `prepare commit`/`chuẩn bị commit` → REPORT-ONLY (chỉ `git status`/`git diff`), KHÔNG `git add/commit/push` tới khi user xác nhận; stage đúng file, không `-A`
- Commit message: `{task_code} {fix|feat}: {tóm tắt}` (xem README cho format Co-Authored-By nếu cần)
