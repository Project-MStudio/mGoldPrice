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
| `GET /api/price?store=...`  | Giá hiện tại: row mới nhất theo `store_id`, decode về JSON. Mặc định `kimphat`.                 |
| `GET /api/history?store=...`| Tất cả row theo `store_id`, decode từng cái, sort theo thời gian.                               |
| `GET /api/cron?store=...`   | Cào → parse → encode → so với lần trước cùng store: khác thì **insert**, giống thì **update** (refresh `updated_at`). Trả `{ store_id, changed, action, data }`. |

CORS mở (`*`) cho mobile. Tất cả route `runtime=nodejs`, `dynamic=force-dynamic`.

## External cron 30s (KHÔNG dùng Vercel Cron)

`/api/cron` chỉ là route — gọi bằng dịch vụ cron ngoài (cron-job.org, EasyCron, GitHub Actions, server riêng...), 30s/lần, kèm header `x-cron-secret`:

```bash
# chạy mỗi 30s từ máy/dịch vụ ngoài
curl -s "https://<app>.vercel.app/api/cron?store=kimphat" \
  -H "x-cron-secret: $CRON_SECRET"
```

- Sai/thiếu secret → `401`.
- cron-job.org: tạo job URL `https://<app>.vercel.app/api/cron?store=kimphat`, interval 30s, thêm custom header `x-cron-secret: <CRON_SECRET>`. Mỗi store chạy 1 job riêng (đổi `?store=`).

## Thêm tiệm mới (không đổi core code)

1. Viết parser cho tiệm trong `src/lib/stores.ts` và thêm 1 entry vào `STORES`:
   ```ts
   mihong: {
     storeId: "mihong",
     name: "Mi Hồng",
     website: "https://...",
     parse: parseMihong, // hàm cheerio riêng cho DOM của tiệm đó
   },
   ```
2. Insert row store vào DB (giống seed, đổi `storeId/name/website`).
3. Thêm 1 external cron job với `?store=mihong`.

`/api/price`, `/api/history`, `/api/cron` đều nhận `?store=` nên dùng ngay, không sửa.

## FE

1 trang dark-only (`src/app/page.tsx`): load `/api/price` + `/api/history`, hiển thị giá vàng hiện tại + lịch sử thay đổi, auto-refresh 30s. Bộ token màu khai báo CSS-first qua `@theme` trong `src/app/globals.css`.
