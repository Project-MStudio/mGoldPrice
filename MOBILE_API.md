# mPriceGold — API cho Mobile

Tài liệu để team mobile build/update giao diện. Toàn bộ là **GET, không cần auth, CORS mở (`*`)**, trả JSON UTF-8.

- **Base URL (production):** `https://m-gold-price.vercel.app`
- **Swagger (thử trực tiếp):** `https://m-gold-price.vercel.app/api/docs`
- **OpenAPI spec:** `https://m-gold-price.vercel.app/api/openapi.json`

App đa tiệm vàng (multi-store). Hiện có 2 tiệm: `kimphat` (Kim Phát), `mihong` (Mi Hồng). Sẽ thêm tiệm khác sau — **đừng hardcode danh sách tiệm, luôn lấy từ `/api/stores`**.

---

## Kiểu dữ liệu chung

```ts
// mức tăng/giảm của 1 giá so với trước
interface GoldChange {
  value: string;             // mức thay đổi đã format, vd "-70,000"
  percent: string;           // vd "-0.51%"
  dir: "up" | "down" | "none"; // up=tăng (xanh ▲), down=giảm (đỏ ▼)
}

// 1 dòng giá vàng
interface GoldRow {
  name: string; // tên loại vàng, vd "NHẪN TRÒN 99.99", "SJC", "999"
  buy: string;  // giá MUA, chuỗi đã format dấu phẩy: "13,550,000". "0"/"-" = không có giá
  sell: string; // giá BÁN, tương tự
  time: string; // thời điểm từ nguồn, format "DD/MM/YYYY HH:mm" (giờ VN), KHÔNG phải ISO
  buyChange?: GoldChange;  // tăng/giảm giá mua — CÓ THỂ THIẾU (không đổi) => ẩn
  sellChange?: GoldChange; // tăng/giảm giá bán — CÓ THỂ THIẾU
}

interface GoldData {
  domestic: GoldRow[]; // vàng trong nước
  world: GoldRow[];    // vàng thế giới (có thể rỗng [] — vd Mi Hồng không có)
}
```

> **Hiển thị tăng/giảm:** mỗi giá có thể kèm `buyChange`/`sellChange`. `dir="up"` → mũi tên lên + **xanh**; `"down"` → mũi tên xuống + **đỏ**; thiếu field hoặc `"none"` → không đổi, ẩn đi. `value`/`percent` có sẵn dấu `-`; khi đã có mũi tên + màu thì nên **bỏ dấu** cho gọn (vd `▼ 70,000 (0.51%)`).

> **Lưu ý parse số:** `buy`/`sell` là CHUỖI có dấu phẩy ngăn nghìn. Muốn ra số: bỏ dấu `,` rồi `parseInt`. Giá `"0"` hoặc `"-"` nghĩa là tiệm không niêm yết (hiển thị "—").
>
> **2 loại thời gian:** `time` (trong GoldRow) là giờ niêm yết từ nguồn dạng `DD/MM/YYYY HH:mm`. `created_at`/`updated_at` là **ISO 8601 UTC** (có `Z`) — dùng cho "cập nhật lúc".

---

## 1. `GET /api/stores` — danh sách tiệm

Dùng để render bộ chọn/filter tiệm.

```json
{
  "count": 2,
  "stores": [
    { "store_id": "kimphat", "name": "Kim Phát", "website": "https://kimphat.evosoft.vn/" },
    { "store_id": "mihong", "name": "Mi Hồng", "website": "https://www.mihong.vn/gia-vang-trong-nuoc" }
  ]
}
```

---

## 2. `GET /api/price` — giá hiện tại TẤT CẢ tiệm (mảng)

Trả **mảng**, mỗi phần tử 1 tiệm. `?store=kimphat` để lọc còn 1 tiệm (vẫn là mảng).

```json
[
  {
    "store": "kimphat",
    "store_name": "Kim Phát",
    "price": {
      "created_at": "2026-06-08T08:45:06.649Z",
      "updated_at": "2026-06-08T08:45:19.351Z",
      "data": {
        "domestic": [
          { "name": "NHẪN TRÒN 99.99", "buy": "13,550,000", "sell": "13,850,000", "time": "08/06/2026 15:38",
            "buyChange": { "value": "-70,000", "percent": "-0.51%", "dir": "down" },
            "sellChange": { "value": "-70,000", "percent": "-0.5%", "dir": "down" } }
        ],
        "world": [
          { "name": "USD/1 OUNCE", "buy": "1,922.10", "sell": "1,923.40", "time": "18/10/2023 03:03" }
        ]
      }
    }
  },
  {
    "store": "mihong",
    "store_name": "Mi Hồng",
    "price": {
      "created_at": "2026-06-08T08:29:52.213Z",
      "updated_at": "2026-06-08T08:45:18.325Z",
      "data": { "domestic": [ { "name": "SJC", "buy": "13,800,000", "sell": "14,050,000", "time": "08/06/2026 15:26" } ], "world": [] }
    }
  }
]
```

---

## 3. `GET /api/price/{store}` — giá hiện tại 1 tiệm (object)

vd `GET /api/price/mihong`. Trả **1 object** (không phải mảng). Store lạ → **404** `{ "error": "Unknown store" }`.

```json
{
  "store": "mihong",
  "store_name": "Mi Hồng",
  "price": {
    "created_at": "2026-06-08T08:29:52.213Z",
    "updated_at": "2026-06-08T08:45:18.325Z",
    "data": { "domestic": [ { "name": "SJC", "buy": "13,800,000", "sell": "14,050,000", "time": "08/06/2026 15:26" } ], "world": [] }
  }
}
```

---

## 4. `GET /api/history` — lịch sử thay đổi TẤT CẢ tiệm (mảng)

Trả **mảng** [{ store, store_name, history }]. `?store=kimphat` lọc còn 1 tiệm. Mỗi phần tử trong `history` là **1 lần giá đổi** (snapshot), sort **cũ → mới**.

```json
[
  {
    "store": "kimphat",
    "store_name": "Kim Phát",
    "history": [
      {
        "id": 1,
        "created_at": "2026-06-08T04:48:00.100Z",
        "updated_at": "2026-06-08T04:48:00.336Z",
        "data": { "domestic": [ { "name": "NHẪN TRÒN 99.99", "buy": "13,620,000", "sell": "13,920,000", "time": "08/06/2026 11:44" } ], "world": [ ... ] }
      }
    ]
  },
  { "store": "mihong", "store_name": "Mi Hồng", "history": [ ... ] }
]
```

---

## 5. `GET /api/history/{store}` — lịch sử 1 tiệm (object)

vd `GET /api/history/kimphat`. Trả **1 object** `{ store, store_name, history }`. Store lạ → **404**.

```json
{
  "store": "kimphat",
  "store_name": "Kim Phát",
  "history": [
    { "id": 1, "created_at": "2026-06-08T04:48:00.100Z", "updated_at": "2026-06-08T04:48:00.336Z",
      "data": { "domestic": [ ... ], "world": [ ... ] } }
  ]
}
```

---

## Ghi chú cho mobile

- **Không auth, CORS mở** — gọi thẳng từ app.
- **Auto refresh:** app nên poll **mỗi 30–60s** màn hình giá hiện tại (`/api/price`). Endpoint này trả cache/DB ngay và đồng thời trigger refresh nền (có cooldown phía server), nên dữ liệu thường lên sớm hơn chu kỳ cron.
- **Đa tiệm:** lấy `/api/stores` → render filter (gợi ý: "Tất cả" + từng tiệm). "Tất cả" gọi `/api/price` & `/api/history` (mảng); chọn 1 tiệm gọi bản `/{store}` (object) hoặc `?store=`.
- **history:** mỗi item = 1 lần đổi giá; `created_at` = lúc snapshot xuất hiện, `updated_at` = lần cuối server xác nhận. Khi gộp nhiều tiệm để hiện timeline, sort theo `created_at` giảm dần và gắn nhãn `store_name`.
- **Phát hiện log mới:** lưu `price.updated_at` (hoặc `history[history.length-1].id`) lần trước; nếu khác ở lần poll sau thì hiển thị badge/log mới.
- **Field có thể rỗng/N/A:** `world` có thể `[]`; `buy`/`sell` có thể `"0"`/`"-"`.
- **404 shape:** `{ "error": "Unknown store" }` khi `{store}` không tồn tại.
- Có thể import thẳng `openapi.json` vào Postman/Swagger để sinh client.
