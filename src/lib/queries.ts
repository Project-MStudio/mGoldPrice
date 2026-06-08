import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory, store } from "@/lib/db/schema";
import { decodeData } from "@/lib/encode";
import type { GoldData, StoreConfig } from "@/lib/stores";

export interface StoreInfo {
  store_id: string;
  name: string;
  website: string;
}

export async function getStores(): Promise<StoreInfo[]> {
  const db = getDb();
  const rows = await db.select().from(store).orderBy(asc(store.storeId));
  return rows.map((r) => ({ store_id: r.storeId, name: r.name, website: r.website }));
}

// Đọc DB + decode (dùng chung cho /api/price, /api/history VÀ trang chủ).
export interface PricePayload {
  store_id: string;
  store_name: string;
  created_at: string | null;
  updated_at: string | null;
  data: GoldData | null;
}

export interface HistoryEntry {
  id: number;
  store_id: string;
  created_at: string;
  updated_at: string;
  data: GoldData;
}

export async function getCurrentPrice(cfg: StoreConfig): Promise<PricePayload> {
  const db = getDb();
  const [latest] = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, cfg.storeId))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(1);

  return {
    store_id: cfg.storeId,
    store_name: cfg.name,
    created_at: latest?.createdAt.toISOString() ?? null,
    updated_at: latest?.updatedAt.toISOString() ?? null,
    data: latest ? (decodeData(latest.dataString) as unknown as GoldData) : null,
  };
}

export async function getHistory(cfg: StoreConfig): Promise<HistoryEntry[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, cfg.storeId))
    .orderBy(asc(priceHistory.createdAt), asc(priceHistory.id));

  return rows.map((r) => ({
    id: r.id,
    store_id: r.storeId,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
    data: decodeData(r.dataString) as unknown as GoldData,
  }));
}
