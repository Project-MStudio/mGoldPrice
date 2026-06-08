import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";
import { encodeData } from "@/lib/encode";
import { cacheDel, cacheKeys } from "@/lib/cache";
import type { GoldData, StoreConfig } from "@/lib/stores";

export interface ScrapeResult {
  store_id: string;
  changed: boolean;
  action: "insert" | "update";
  data: GoldData;
}

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
