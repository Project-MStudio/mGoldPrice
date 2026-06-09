import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";
import { encodeData } from "@/lib/encode";
import { cacheDel, cacheKeys } from "@/lib/cache";
import { getStore, type GoldData, type StoreConfig } from "@/lib/stores";
import { getStores } from "@/lib/queries";

export interface ScrapeResult {
  store_id: string;
  changed: boolean;
  action: "insert" | "update";
  data: GoldData;
}

// Kết quả cào 1 store trong vòng loop "tất cả": thành công | bỏ qua | lỗi (đều không ném).
export type ScrapeAllItem =
  | ScrapeResult
  | { store_id: string; skipped: string }
  | { store_id: string; error: string };

// Logic cào + so khớp + lưu (dùng chung cho /api/cron VÀ trang chủ load).
// Mỗi store tự lo fetch nguồn (HTML hoặc API JSON) qua cfg.fetchData().
// Khác lần trước cùng store_id -> INSERT row mới; giống -> UPDATE row mới nhất (refresh updated_at).
export async function scrapeAndStore(cfg: StoreConfig): Promise<ScrapeResult> {
  const data = await cfg.fetchData();
  const encoded = encodeData(data);

  const db = getDb();
  const [latest] = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, cfg.storeId))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(1);

  let changed: boolean;
  let action: "insert" | "update";

  if (!latest || latest.dataString !== encoded) {
    await db.insert(priceHistory).values({ storeId: cfg.storeId, dataString: encoded });
    changed = true;
    action = "insert";
  } else {
    await db
      .update(priceHistory)
      .set({ dataString: encoded, updatedAt: new Date() })
      .where(eq(priceHistory.id, latest.id));
    changed = false;
    action = "update";
  }

  // Ghi DB xong -> invalidate cache liên quan (per-store + aggregate all) để GET đọc data mới.
  await cacheDel(
    cacheKeys.price(cfg.storeId),
    cacheKeys.pricesAll,
    cacheKeys.history(cfg.storeId),
    cacheKeys.historiesAll,
  );

  return { store_id: cfg.storeId, changed, action, data };
}

// ============================================================================
// SERVICE CÀO DUY NHẤT cho "tất cả tiệm" — NGUỒN LOGIC CÀO CHUNG của cả hệ thống.
//
// Mọi nơi cần "cào hết" (cron định kỳ, background refresh khi app poll, hoặc bất kỳ API nào
// muốn cào sau này) ĐỀU gọi hàm này — KHÔNG tự viết lại vòng loop cào ở chỗ khác.
//
// Quy tắc mở rộng (BẮT BUỘC tuân thủ — xem PROJECT_CONTEXT.md):
//   • Thêm tiệm mới: CHỈ thêm entry vào STORES (src/lib/stores.ts) + seed 1 row vào bảng store.
//     Hàm này tự loop theo bảng store nên KHÔNG cần sửa gì ở đây.
//   • Thêm cào vào 1 API khác (vd /api/history): chỉ cần import & gọi scrapeAllStores() ở API đó.
//
// 1 store lỗi KHÔNG làm hỏng store khác (try/catch từng cái) -> trả mảng kết quả gồm cả
// thành công / skipped (chưa đăng ký fetcher) / error.
// ============================================================================
export async function scrapeAllStores(): Promise<ScrapeAllItem[]> {
  const stores = await getStores();
  return Promise.all(
    stores.map(async (s): Promise<ScrapeAllItem> => {
      const cfg = getStore(s.store_id);
      if (!cfg) {
        // Có trong DB nhưng chưa đăng ký fetcher trong src/lib/stores.ts.
        return { store_id: s.store_id, skipped: "no fetcher registered" };
      }
      try {
        return await scrapeAndStore(cfg);
      } catch (err) {
        return { store_id: s.store_id, error: (err as Error).message };
      }
    }),
  );
}
