import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory, store } from "@/lib/db/schema";
import { decodeData } from "@/lib/encode";
import { cacheGet, cacheKeys, cacheSet } from "@/lib/cache";
import type { GoldData } from "@/lib/stores";

export interface StoreInfo {
  store_id: string;
  name: string;
  website: string;
}

export async function getStores(): Promise<StoreInfo[]> {
  const cached = await cacheGet<StoreInfo[]>(cacheKeys.stores);
  if (cached) return cached;

  const db = getDb();
  const rows = await db.select().from(store).orderBy(asc(store.storeId));
  const result = rows.map((r) => ({ store_id: r.storeId, name: r.name, website: r.website }));
  await cacheSet(cacheKeys.stores, result);
  return result;
}

// Đọc DB + decode (dùng chung cho /api/price, /api/history VÀ trang chủ).
// /api/price trả mảng: [{ store, store_name, price: { created_at, updated_at, data } }, ...]
export interface PriceEntry {
  store: string;
  store_name: string;
  price: {
    created_at: string | null;
    updated_at: string | null;
    data: GoldData | null;
  };
}

export interface HistoryItem {
  id: number;
  created_at: string;
  updated_at: string;
  data: GoldData;
}

// /api/history trả mảng song song với /api/price: [{ store, store_name, history: [...] }, ...]
export interface StoreHistory {
  store: string;
  store_name: string;
  history: HistoryItem[];
}

async function priceForStore(storeId: string, storeName: string): Promise<PriceEntry> {
  const db = getDb();
  const [latest] = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, storeId))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(1);

  return {
    store: storeId,
    store_name: storeName,
    price: {
      created_at: latest?.createdAt.toISOString() ?? null,
      updated_at: latest?.updatedAt.toISOString() ?? null,
      data: latest ? (decodeData(latest.dataString) as unknown as GoldData) : null,
    },
  };
}

// Trả mảng giá theo store. Không truyền storeId -> tất cả store; có -> lọc còn store đó.
export async function getPrices(storeId?: string | null): Promise<PriceEntry[]> {
  const key = storeId ? cacheKeys.price(storeId) : cacheKeys.pricesAll;
  const cached = await cacheGet<PriceEntry[]>(key);
  if (cached) return cached;

  const stores = await getStores();
  const targets = storeId ? stores.filter((s) => s.store_id === storeId) : stores;
  const result = await Promise.all(targets.map((s) => priceForStore(s.store_id, s.name)));
  await cacheSet(key, result);
  return result;
}

async function historyForStore(storeId: string, storeName: string): Promise<StoreHistory> {
  const db = getDb();
  const rows = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, storeId))
    .orderBy(asc(priceHistory.createdAt), asc(priceHistory.id));

  return {
    store: storeId,
    store_name: storeName,
    history: rows.map((r) => ({
      id: r.id,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
      data: decodeData(r.dataString) as unknown as GoldData,
    })),
  };
}

// Trả mảng lịch sử theo store. Không truyền storeId -> tất cả store; có -> lọc còn store đó.
export async function getHistories(storeId?: string | null): Promise<StoreHistory[]> {
  const key = storeId ? cacheKeys.history(storeId) : cacheKeys.historiesAll;
  const cached = await cacheGet<StoreHistory[]>(key);
  if (cached) return cached;

  const stores = await getStores();
  const targets = storeId ? stores.filter((s) => s.store_id === storeId) : stores;
  const result = await Promise.all(targets.map((s) => historyForStore(s.store_id, s.name)));
  await cacheSet(key, result);
  return result;
}
