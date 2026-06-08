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
| `GET /api/cron`             | **Không có `?store=`** → cào **TẤT CẢ store** trong bảng store, trả `{ count, results: [...] }`. **Có `?store=`** → cào 1 store, trả `{ store_id, changed, action, data }`. Cào → encode → so với lần trước cùng store: khác thì **insert**, giống thì **update** (refresh `updated_at`). |

CORS mở (`*`) cho mobile. Tất cả route `runtime=nodejs`, `dynamic=force-dynamic`.

### Swagger / OpenAPI (chỉ doc API)

| Route | Mô tả |
| ----- | ----- |
| `GET /api/docs` | Trang Swagger UI (nạp từ CDN), xem + "Try it out". |
| `GET /api/openapi.json` | OpenAPI 3.1 spec mô tả `/api/stores`, `/api/price`, `/api/history`, `/api/cron`. |

Zero-dependency: spec viết tay ở `src/lib/openapi.ts`, không cài thêm package. Bật `/api/cron` trong "Try it out" cần điền `x-cron-secret` (nút **Authorize**). Production: `https://m-gold-price.vercel.app/api/docs`.

## External cron 5 phút (KHÔNG dùng Vercel Cron)

> Vì sao không dùng Vercel Cron: free tier (Hobby) chỉ cho cron **1 lần/ngày** — biểu thức chạy dày hơn (vd `*/5 * * * *`) sẽ **deploy fail**. 5 phút/lần cần Vercel Pro. Nên dùng external cron (miễn phí, tần suất tuỳ ý).

**CHỈ CẦN 1 cron duy nhất** gọi `/api/cron` (KHÔNG kèm `?store=`) — route tự loop tất cả store trong bảng store và cào từng cái. Thêm tiệm mới về sau **không phải tạo cron mới**.

```bash
# chạy mỗi 5 phút từ máy/dịch vụ ngoài — cào HẾT mọi store
curl -s "https://<app>.vercel.app/api/cron" \
  -H "x-cron-secret: $CRON_SECRET"
```

- Sai/thiếu secret → `401`.
- **cron-job.org** (free): tạo **1 job** URL `https://<app>.vercel.app/api/cron` (không `?store=`), **Schedule: Every 5 minutes** (hoặc cron `*/5 * * * *`), thêm custom header `x-cron-secret: <CRON_SECRET>`.
- Mỗi store cào độc lập: 1 store lỗi → phần tử `{ store_id, error }` trong `results`, không ảnh hưởng store khác.
- Muốn cào thủ công 1 store: thêm `?store=<id>`.
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

**Rule cố định — thêm store sau này cứ làm đúng 2 bước này, KHÔNG đụng core, KHÔNG tạo cron mới:**

1. Thêm entry vào `STORES` (`src/lib/stores.ts`) như trên (HTML → cheerio; SPA/JS-render → cào API JSON).
2. Insert row store vào DB (thêm vào `src/lib/db/seed.ts` rồi `npm run db:seed`, idempotent).

Xong. Cron duy nhất `/api/cron` (không `?store=`) **tự động cào store mới** ở chu kỳ kế tiếp vì nó loop theo bảng store. `/api/stores`, `/api/price`, `/api/history` đều nhận `?store=` nên dùng ngay, không sửa code.

**Stores hiện có:** `kimphat` (Kim Phát — cào HTML tĩnh), `mihong` (Mi Hồng — trang là SPA/JS-render nên cào API `https://api.mihong.vn/v1/gold-prices?market=domestic`).

`/api/price`, `/api/history`, `/api/cron` đều nhận `?store=` nên dùng ngay, không sửa.

## FE

1 trang dark-only: `src/app/page.tsx` (server component) + `src/app/price-view.tsx` (client). Bộ token màu khai báo CSS-first qua `@theme` trong `src/app/globals.css`.

- **Bộ lọc store**: chọn `Tất cả` / từng tiệm (Kim Phát, Mi Hồng...). "Tất cả" hiển thị giá từng tiệm + lịch sử gộp; history mỗi dòng có **nhãn store** để biết tiệm nào đổi. Danh sách store lấy từ `/api/stores` (server truyền xuống) nên thêm tiệm là tự có trong selector.
- **Mỗi lần load web tự cào + lưu DB** (giống cron): server component gọi `scrapeAndStore()` cho tất cả store mỗi request, rồi render data mới nhất → có data ngay cả khi chưa set cron. Logic dùng chung trong `src/lib/scrape.ts` (ghi) + `src/lib/queries.ts` (đọc), chia sẻ với cả các API route.
- Sau đó client auto-refresh `/api/price` + `/api/history` mỗi 30s (chỉ đọc, không cào).
- Vì page tự cào, external cron là tuỳ chọn — hữu ích để cập nhật khi không ai mở web. Lưu ý: scrape mỗi page-load tăng tải lên trang nguồn; nếu traffic cao nên thêm guard staleness trong `page.tsx`.
