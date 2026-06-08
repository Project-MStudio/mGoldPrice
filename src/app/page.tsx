import {
  getHistories,
  getPrices,
  getStores,
  type PriceEntry,
  type StoreHistory,
  type StoreInfo,
} from "@/lib/queries";
import PriceView from "./price-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  // SSR: đọc sẵn data (qua cache, fallback DB) rồi render thẳng — không scrape, không chờ client fetch.
  // Freshness do cron (5 phút) đảm nhiệm; ghi DB sẽ invalidate cache.
  let stores: StoreInfo[] = [];
  let prices: PriceEntry[] = [];
  let histories: StoreHistory[] = [];
  try {
    [stores, prices, histories] = await Promise.all([getStores(), getPrices(), getHistories()]);
  } catch {
    // DB/cache lỗi -> render khung, client tự fetch lại
  }

  // gộp lịch sử các store, mới nhất lên đầu (đồng bộ với logic client)
  const initialHistory = histories
    .flatMap((sh) =>
      sh.history.map((it) => ({ ...it, store: sh.store, store_name: sh.store_name })),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return <PriceView stores={stores} initialPrices={prices} initialHistory={initialHistory} />;
}
