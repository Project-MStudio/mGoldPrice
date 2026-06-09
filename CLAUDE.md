# CLAUDE.md — mPriceGold (mGoldPrice)

> **`{RULES}`** = Hydra root = `.cursor` (Layout A — Hydra clone thẳng vào `.cursor`, chuẩn M-Studio trong README Hydra).
> Bản bootstrap đầy đủ (đồng bộ với §0): `{RULES}/example/HYDRA_BOOT_BLOCK.md`.
> Sau Bước 0, khi conflict: ưu tiên agent Hydra + `{RULES}/rules/*.mdc` cho process; `AGENTS.md` root bổ sung app context.
> ⚠️ Repo này là **Next.js server-side/serverless** — KHÔNG phải React-Native/Flutter. Routing Table Hydra thiên mobile; chỉ dùng agent phù hợp (analyst-task, implementation, debugger-agent, code-review, api-contract, system-architecture, unittest, security-auditor, technical-writer).
> Last updated: 2026-06-09

---

## 0. Hydra System — REQUIRED

> Bản canonical: `{RULES}/example/HYDRA_BOOT_BLOCK.md`. Giữ §0 này đồng bộ khi sửa.

### STOP TRƯỚC KHI LÀM BẤT CỨ GÌ

Repo dùng **Hydra** tại `{RULES}/`. Mọi request phải **đi qua routing**: đọc định nghĩa agent rồi mới thực thi.

#### STEP 0 (bắt buộc)
1. Đọc `{RULES}/MANIFESTO.md`
2. Đọc `{RULES}/rules/base_rule.mdc`
3. Dùng **Routing Table** trong `HYDRA_BOOT_BLOCK.md` — chọn agent
4. Đọc **đủ** file agent (và `depends_on` nếu có)
5. Đọc `{RULES}/departments/engineering/skills/skill-personal-rules.md` trước khi code
6. Rồi mới code / nội dung chính

Bỏ Bước 0 → output không hợp lệ.

#### Khi không agent nào khớp (HYDRA GAP)
Dùng khả năng model mặc định, rồi in block `⚠️ HYDRA GAP DETECTED` ở cuối response (mẫu trong `HYDRA_BOOT_BLOCK.md`). Lưu ý: Next.js backend nhiều khi rơi vào GAP vì Hydra hướng mobile — đề xuất agent mới theo mẫu nếu lặp lại.

#### Task size (trước routing)
| Task | Workflow |
|---|---|
| <5 LOC, 1 file, không đụng API/service/schema | nano — `pipeline/workflows/nano-workflow.md` |
| Root cause rõ, vừa, không đụng kiến trúc | bugfix — `pipeline/workflows/bugfix.md` |
| Feature >50 LOC / ≥3 file / đụng scrape-service/schema/API | feature — `pipeline/workflows/feature.md` |

---

## 1. Project Overview

**mPriceGold** — cào giá vàng đa tiệm từ web → parse → lưu Postgres → phục vụ Web SSR + API JSON cho app Flutter.

- Runtime/framework: Next.js 16 App Router + TypeScript, Vercel serverless (Node, region `sin1`)
- Core domains: scraping giá vàng, lưu lịch sử, API mobile, web SSR
- Real-time/data mode: **KHÔNG realtime** — poll 30–60s (app) + cron 15p (external). Không socket/SSE
- Environments: Vercel (Hobby) · Neon Postgres · Upstash Redis · cron-job.org

---

## 2. Tech Stack

| Layer | Library / Approach |
|---|---|
| Server | Next.js 16 App Router (route handlers + Server Components) |
| DB / ORM | Neon serverless Postgres + Drizzle ORM |
| Cache / Lock | Upstash Redis (REST) — cache đọc + `cacheLock` cooldown |
| Scraping | cheerio (HTML tĩnh) hoặc fetch API JSON tuỳ tiệm |
| Styling | Tailwind v4 (CSS-first `@theme`), dark-only |
| Background | `after()` (next/server) + Redis cooldown |
| Deploy | Vercel free; external cron 15p |

---

## 3. Project Structure

```text
src/
├── app/
│   ├── api/
│   │   ├── stores/route.ts          # GET danh sách tiệm
│   │   ├── price/route.ts           # GET giá tất cả (✅ cào nền tất cả)
│   │   ├── price/[store]/route.ts   # GET giá 1 tiệm (chỉ đọc)
│   │   ├── history/route.ts         # GET lịch sử tất cả (chỉ đọc)
│   │   ├── history/[store]/route.ts # GET lịch sử 1 tiệm (chỉ đọc)
│   │   ├── cron/route.ts            # GET cào đồng bộ (CRON_SECRET)
│   │   ├── docs/route.ts            # Swagger UI
│   │   └── openapi.json/route.ts    # OpenAPI spec
│   ├── page.tsx + price-view.tsx    # Web SSR + client poll
│   └── globals.css
└── lib/
    ├── scrape.ts      # NGUỒN CÀO DUY NHẤT: scrapeAndStore + scrapeAllStores
    ├── stores.ts      # registry STORES + parser từng tiệm
    ├── queries.ts     # đọc cache→DB→decode
    ├── cache.ts       # Upstash + cacheLock
    ├── refresh.ts     # triggerBackgroundRefresh (cào nền có cooldown)
    ├── encode.ts      # encode/decode base64 canonical
    ├── cors.ts · openapi.ts
    └── db/ (schema, seed, index)
```

Key files:
- `src/lib/scrape.ts` — nguồn cào duy nhất; mọi nơi cần cào hết gọi `scrapeAllStores()`
- `src/lib/stores.ts` — thêm tiệm CHỈ sửa ở đây (+ seed)
- `src/lib/refresh.ts` — cào nền có cooldown, gọi qua `after()` trong route price

---

## 4. Cursor / rule paths

- Hydra root: `{RULES}/` = `.cursor`
- Base rules: `{RULES}/rules/base_rule.mdc`
- Knowledge: `{RULES}/knowledge/lessons/`

Priority (sau Bước 0): `AGENTS.md` (root, app context) > `{RULES}/rules/*` (process) > `.cursorrules` > `CLAUDE.md` / `PROJECT_CONTEXT.md`

---

## 5. Code Conventions

### Type System
- Tránh `any`; dùng type sẵn có (`GoldData`/`StoreConfig`/`ScrapeAllItem`/`PriceEntry`/`StoreHistory`)
- Conditional ≥ 3 nhánh → map/dictionary thay if-else/switch

### Server / Next.js
- Route handler MỎNG: parse → gọi service `src/lib/` → trả JSON. Không nhúng logic
- Mọi route: `runtime="nodejs"` + `dynamic="force-dynamic"` + `OPTIONS()` + `corsHeaders()`
- Việc nền LUÔN `after()`; cooldown LUÔN `cacheLock` (Redis)

### Files
- Logic ở `src/lib/`, không ở route. Quét `src/lib/` tìm helper sẵn trước khi viết mới

### Commits / Git
- KHÔNG `git add -A` — stage đúng file. Trước commit: hiện full file list, chờ user xác nhận
- Chạy `npx tsc --noEmit` + `npm test` trước khi finalize

---

## 6. Critical Rules

### SCOPE_LOCK
Request nhỏ → làm đúng cái đó. Không scope creep, không refactor thừa.

### End-to-End
Scope đã chốt → làm đủ; không để TODO "phần còn lại...".

### Blast Radius (khi đụng shared layer)
- 🔴 CRITICAL: `src/lib/scrape.ts`, `src/lib/encode.ts`, `src/lib/db/schema.ts` → liệt kê API/flow ảnh hưởng, cần migration nếu đổi schema
- 🟠 HIGH: `src/lib/queries.ts`, `src/lib/cache.ts`, `src/lib/refresh.ts`, `src/lib/stores.ts` → ảnh hưởng cache/cào nhiều route
- 🟡 MEDIUM: 1 route handler, UI

### Guards
Thêm tiệm → chỉ `stores.ts` + seed. Thêm cào API → chỉ gọi service. KHÔNG sửa lan man.

---

## 7. Lessons Learned (Critical)

| # | Lesson | Rule |
|---|---|---|
| 1 | Fire-and-forget cào nền bị Vercel freeze sau response | Việc nền LUÔN qua `after()` |
| 2 | Cooldown biến RAM vô dụng đa-instance (thundering herd) | Cooldown LUÔN `cacheLock` (Redis) |
| 3 | Socket/SSE không sống trên Vercel serverless | Push <1s thì dùng dịch vụ ngoài, không tự dựng trên Vercel |
| 4 | Trùng logic cào ở cron + price khó bảo trì | 1 nguồn cào `scrapeAllStores()`; thêm tiệm chỉ sửa `stores.ts` |

Chi tiết lessons hệ thống: `{RULES}/knowledge/lessons/`.

---

## 8. Documentation Default

User bảo "viết doc" → mặc định theo style repo (`README.md`/`MOBILE_API.md`/`PROJECT_CONTEXT.md` Markdown tiếng Việt). HTML song ngữ chỉ khi yêu cầu rõ.

---

## 9. Non-Trivial Task Protocol

Task ≥ 50 LOC / ≥ 3 file / đụng scrape-service + schema + API contract:
1. Viết spec/plan trước
2. Lưu `{RULES}/history/plans/{name}_{ts}.md` (hoặc nêu plan để user duyệt)
3. Verify với user trước khi code

**Checklist trước khi xong:**
- [ ] `npx tsc --noEmit` sạch
- [ ] `npm test` pass
- [ ] Route mỏng, logic ở `src/lib/`
- [ ] Việc nền `after()`, cooldown `cacheLock`, cào hết `scrapeAllStores()`, ghi DB có `cacheDel`
- [ ] Đổi API → cập nhật `MOBILE_API.md` + `openapi.ts`

---

## 10. Commands

```bash
npm run dev
npx tsc --noEmit
npm test
npm run db:migrate   # GHI DB THẬT
npm run db:seed      # GHI DB THẬT (idempotent)
```
