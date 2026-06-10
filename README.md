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
| `GET /api/price`            | **Mảng** `[{ store, store_name, price: { created_at, updated_at, data } }]`. Không `?store=` → tất cả store; có → lọc còn store đó (1 phần tử). |
| `GET /api/price/{store}`    | **1 object** `{ store, store_name, price }` cho đúng store đó (404 nếu store lạ).                |
| `GET /api/history`          | **Mảng** `[{ store, store_name, history: [{ id, created_at, updated_at, data }] }]`. Không `?store=` → tất cả; có → lọc còn store đó. |
| `GET /api/history/{store}`  | **1 object** `{ store, store_name, history }` cho đúng store đó (404 nếu store lạ).             |
| `GET /api/cron`             | **Không có `?store=`** → cào **TẤT CẢ store** trong bảng store, trả `{ count, results: [...] }`. **Có `?store=`** → cào 1 store, trả `{ store_id, changed, action, data }`. Cào → encode → so với lần trước cùng store: khác thì **insert**, giống thì **update** (refresh `updated_at`). |

CORS mở (`*`) cho mobile. Tất cả route `runtime=nodejs`, `dynamic=force-dynamic`.

### Cache (Upstash Redis) + tốc độ

- GET (`getStores`/`getPrices`/`getHistories` trong `src/lib/queries.ts`) đọc **cache trước**, miss mới query DB rồi set cache (TTL 600s). Ghi DB (`scrapeAndStore`) **invalidate** key liên quan (`price:<store>`, `price:all`, `history:<store>`, `history:all`) → GET kế tiếp lấy data mới.
- Cache qua **Upstash Redis REST** (`@upstash/redis`, hợp serverless). Set 2 env `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`. **Thiếu env → cache tự tắt**, API đọc thẳng DB (không vỡ). Lỗi Redis cũng nuốt, không chặn request.
- **Trang chủ SSR**: server đọc data (cache/DB) render sẵn vào HTML rồi mới giao client (không còn cảnh render UI xong mới call API). Trang **không scrape trực tiếp trong page load** — việc cào do cron định kỳ và `/api/refresh` (nút reload thủ công) xử lý.

### Hai flow làm tươi data (KHÔNG có socket/realtime)

App **không** dùng socket/MQTT/SSE (Vercel serverless không giữ kết nối thường trực được —
function chết sau mỗi request, SSE giữ-connection vừa rớt mỗi ~60s vừa đốt quota theo số user).
Thay vào đó data được làm tươi bằng **2 flow song song**:

1. **Cron định kỳ (nền, lúc app chưa mở)** — external cron gọi `/api/cron` mỗi **15 phút**
   (cron-job.org). Cào sẵn vào DB nên khi user mở app là đã có data mới nhất. Đây là nguồn
   freshness chính, chạy bất kể có traffic đọc hay không.
2. **Reload thủ công (khi app đang mở)** — `GET /api/price` & `/api/history` giờ **CHỈ ĐỌC** (không
   cào) → poll 30–60s không ghi DB. Muốn ép cào data mới, user bấm nút reload → **`GET /api/refresh`**
   (cào ngay tất cả tiệm + lưu DB) rồi app đọc lại `/api/price`. Tách cào khỏi đọc để **giảm ghi DB**.

> **Nguồn cào duy nhất:** logic "cào tất cả" chỉ nằm ở `scrapeAllStores()` (`src/lib/scrape.ts`);
> cả `/api/cron` lẫn `/api/refresh` đều gọi nó. **Thêm tiệm chỉ sửa `src/lib/stores.ts` + seed DB.**
> Chi tiết kiến trúc & rule cho agent/dev mới: xem **`PROJECT_CONTEXT.md`**.

Logic cào (`scrapeAndStore`) dùng chung: cào → encode → so với row mới nhất cùng store —
**khác thì INSERT row mới**, **giống thì UPDATE** (refresh `updated_at`).

### `GET /api/refresh` — cào thủ công (flow 2)

- **GET, public, KHÔNG auth, KHÔNG cooldown** — gọi thẳng `scrapeAllStores()` y như `/api/cron`
  (cào TẤT CẢ tiệm, không phân biệt store). Dùng cho nút reload web + nút làm mới mobile.
- Trả `{ count, results }` giống `/api/cron`. Cào chỉ xảy ra ở đây hoặc cron → đọc/poll không ghi DB.
- Khác `/api/cron`: `/api/refresh` không cần `CRON_SECRET` (để client gọi trực tiếp); `/api/cron` vẫn
  là job nền định kỳ có bảo vệ secret.

### Swagger / OpenAPI (chỉ doc API)

| Route | Mô tả |
| ----- | ----- |
| `GET /api/docs` | Trang Swagger UI (nạp từ CDN), xem + "Try it out". |
| `GET /api/openapi.json` | OpenAPI 3.1 spec mô tả toàn bộ API (`/api/stores`, `/api/price[/{store}]`, `/api/history[/{store}]`, `/api/cron`). |

Zero-dependency: spec viết tay ở `src/lib/openapi.ts`, không cài thêm package. Bật `/api/cron` trong "Try it out" cần điền `x-cron-secret` (nút **Authorize**). Production: `https://m-gold-price.vercel.app/api/docs`.

## External cron 15 phút (KHÔNG dùng Vercel Cron)

> Vì sao không dùng Vercel Cron: free tier (Hobby) chỉ cho cron **1 lần/ngày** — biểu thức chạy dày hơn (vd `*/15 * * * *`) sẽ **deploy fail**. Tần suất dày cần Vercel Pro. Nên dùng external cron (miễn phí, tần suất tuỳ ý).

**CHỈ CẦN 1 cron duy nhất** gọi `/api/cron` (KHÔNG kèm `?store=`) — route tự loop tất cả store trong bảng store và cào từng cái. Thêm tiệm mới về sau **không phải tạo cron mới**.

```bash
# chạy mỗi 15 phút từ máy/dịch vụ ngoài — cào HẾT mọi store
curl -s "https://<app>.vercel.app/api/cron" \
  -H "x-cron-secret: $CRON_SECRET"
```

- Sai/thiếu secret → `401`.
- **cron-job.org** (free): tạo **1 job** URL `https://<app>.vercel.app/api/cron` (không `?store=`), **Schedule: Every 15 minutes** (hoặc cron `*/15 * * * *`), thêm custom header `x-cron-secret: <CRON_SECRET>`.
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
- **SSR**: server component (`page.tsx`) đọc sẵn `getStores`/`getPrices`/`getHistories` (qua cache/DB) và render thẳng vào HTML → có data ngay từ first paint. Logic đọc dùng chung trong `src/lib/queries.ts`.
- Sau đó client auto-refresh `/api/price` + `/api/history` mỗi 30s (CHỈ đọc cache/DB, không cào). Nút reload bấm tay mới gọi `/api/refresh` để cào.
- Trang **không scrape khi load** — việc cào do cron `/api/cron` (15 phút) lo, nên trang nhẹ & nhanh.
