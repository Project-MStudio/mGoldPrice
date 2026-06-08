# mPriceGold

Cào giá vàng từ web → parse → lưu Neon Postgres (dạng string đã encode) → hiển thị FE dark-mode + expose API cho mobile.
Next.js 16 · App Router · TypeScript · Tailwind v4 · Drizzle ORM · Neon serverless. Deploy Vercel free tier.

Nguồn đầu tiên: **Kim Phát** (`https://kimphat.evosoft.vn/`). Schema multi-store: thêm tiệm khác (mihong, doji, pnj...) không phải đổi schema.

## Setup

```bash
npm install
cp .env.example .env      # điền DATABASE_URL (Neon) + CRON_SECRET
npm run db:generate       # đã có sẵn migration trong drizzle/ (chỉ chạy lại khi đổi schema)
npm run db:migrate        # tạo bảng trên Neon  (GHI DB THẬT)
npm run db:seed           # seed store "Kim Phát" (store_id=kimphat)  (GHI DB THẬT)
npm run dev               # http://localhost:3000
```

### Biến môi trường (`.env`)

| Biến           | Mô tả                                                              |
| -------------- | ------------------------------------------------------------------ |
| `DATABASE_URL` | Neon Postgres connection string (dùng **Pooled connection**).      |
| `CRON_SECRET`  | Secret bảo vệ `/api/cron`. Tạo: `openssl rand -hex 32`.            |

## DB (multi-store)

- `store`: `store_id` (text PK, đồng thời là định danh ở API), `name`, `website`.
- `price_history`: `id` (serial PK), `store_id` (FK → store), `data_string` (chuỗi encode), `created_at`, `updated_at`.

Mọi logic cào/so khớp gắn theo `store_id`.

## Encode/decode

`src/lib/encode.ts` — `encodeData(obj)` sort key trước rồi base64 hoá canonical JSON (deterministic). `decodeData(str)` dịch ngược.
Round-trip test: `npm test`.

## API

| Route                       | Mô tả                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| `GET /api/stores`           | Danh sách store đã đăng ký (từ bảng `store`).                                                   |
| `GET /api/price?store=...`  | Giá hiện tại: row mới nhất theo `store_id`, decode về JSON. Mặc định `kimphat`.                 |
| `GET /api/history?store=...`| Tất cả row theo `store_id`, decode từng cái, sort theo thời gian.                               |
| `GET /api/cron?store=...`   | Cào → parse → encode → so với lần trước cùng store: khác thì **insert**, giống thì **update** (refresh `updated_at`). Trả `{ store_id, changed, action, data }`. |

CORS mở (`*`) cho mobile. Tất cả route `runtime=nodejs`, `dynamic=force-dynamic`.

### Swagger / OpenAPI (chỉ doc API)

| Route | Mô tả |
| ----- | ----- |
| `GET /api/docs` | Trang Swagger UI (nạp từ CDN), xem + "Try it out". |
| `GET /api/openapi.json` | OpenAPI 3.1 spec mô tả `/api/price`, `/api/history`, `/api/cron`. |

Zero-dependency: spec viết tay ở `src/lib/openapi.ts`, không cài thêm package. Bật `/api/cron` trong "Try it out" cần điền `x-cron-secret` (nút **Authorize**). Production: `https://m-gold-price.vercel.app/api/docs`.

## External cron 5 phút (KHÔNG dùng Vercel Cron)

> Vì sao không dùng Vercel Cron: free tier (Hobby) chỉ cho cron **1 lần/ngày** — biểu thức chạy dày hơn (vd `*/5 * * * *`) sẽ **deploy fail**. 5 phút/lần cần Vercel Pro. Nên dùng external cron (miễn phí, tần suất tuỳ ý).

`/api/cron` chỉ là route — gọi bằng dịch vụ cron ngoài (cron-job.org, EasyCron, GitHub Actions, server riêng...), 5 phút/lần, kèm header `x-cron-secret`:

```bash
# chạy mỗi 5 phút từ máy/dịch vụ ngoài
curl -s "https://<app>.vercel.app/api/cron?store=kimphat" \
  -H "x-cron-secret: $CRON_SECRET"
```

- Sai/thiếu secret → `401`.
- **cron-job.org** (free): tạo job URL `https://<app>.vercel.app/api/cron?store=kimphat`, **Schedule: Every 5 minutes** (hoặc cron `*/5 * * * *`), thêm custom header `x-cron-secret: <CRON_SECRET>`. Mỗi store chạy 1 job riêng (đổi `?store=`).
- Route cũng chấp nhận `Authorization: Bearer <CRON_SECRET>` — tương thích sẵn nếu sau này đổi sang Vercel Cron (Pro).

## Thêm tiệm mới (không đổi core code)

Mỗi store tự lo fetch nguồn (HTML hoặc API JSON) + parse qua `fetchData()`:

```ts
// src/lib/stores.ts -> STORES
tiemmoi: {
  storeId: "tiemmoi",
  name: "Tiệm Mới",
  website: "https://...",            // trang hiển thị cho user
  fetchData: async () => {           // nguồn cào thật + parse -> GoldData
    const res = await fetch("https://nguon-that/...");
    return parseTiemMoi(await res.text()); // hoặc map JSON nếu là API
  },
},
```

1. Thêm entry vào `STORES` như trên (HTML thì dùng cheerio; SPA/JS-render thì cào API JSON).
2. Insert row store vào DB (thêm vào `src/lib/db/seed.ts` rồi `npm run db:seed`, idempotent).
3. Thêm 1 external cron job với `?store=tiemmoi`.

`/api/stores`, `/api/price`, `/api/history`, `/api/cron` đều nhận `?store=` nên dùng ngay, không sửa code.

**Stores hiện có:** `kimphat` (Kim Phát — cào HTML tĩnh), `mihong` (Mi Hồng — trang là SPA/JS-render nên cào API `https://api.mihong.vn/v1/gold-prices?market=domestic`).

`/api/price`, `/api/history`, `/api/cron` đều nhận `?store=` nên dùng ngay, không sửa.

## FE

1 trang dark-only: `src/app/page.tsx` (server component) + `src/app/price-view.tsx` (client). Bộ token màu khai báo CSS-first qua `@theme` trong `src/app/globals.css`.

- **Mỗi lần load web tự cào + lưu DB** (giống cron): server component gọi `scrapeAndStore()` server-side mỗi request, rồi render data mới nhất → có data ngay cả khi chưa set cron. Logic dùng chung trong `src/lib/scrape.ts` (ghi) + `src/lib/queries.ts` (đọc), chia sẻ với cả 3 API route.
- Sau đó client auto-refresh `/api/price` + `/api/history` mỗi 30s (chỉ đọc, không cào).
- Vì page tự cào, external cron là tuỳ chọn — hữu ích để cập nhật khi không ai mở web. Lưu ý: scrape mỗi page-load tăng tải lên trang nguồn; nếu traffic cao nên thêm guard staleness trong `page.tsx`.
