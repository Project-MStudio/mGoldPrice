import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";
import { encodeData } from "@/lib/encode";
import type { GoldData, StoreConfig } from "@/lib/stores";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export interface ScrapeResult {
  store_id: string;
  changed: boolean;
  action: "insert" | "update";
  data: GoldData;
}

// Logic cào + so khớp + lưu (dùng chung cho /api/cron VÀ trang chủ load).
// Khác lần trước cùng store_id -> INSERT row mới; giống -> UPDATE row mới nhất (refresh updated_at).
export async function scrapeAndStore(cfg: StoreConfig): Promise<ScrapeResult> {
  const res = await fetch(cfg.website, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Fetch source failed: ${res.status}`);
  }
  const html = await res.text();
  const data = cfg.parse(html);
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

  return { store_id: cfg.storeId, changed, action, data };
}
