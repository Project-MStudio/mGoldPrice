import { DEFAULT_STORE, getStore } from "@/lib/stores";
import { scrapeAndStore } from "@/lib/scrape";
import { getCurrentPrice, getHistory, type HistoryEntry, type PricePayload } from "@/lib/queries";
import PriceView from "./price-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const cfg = getStore(DEFAULT_STORE)!;

  // Mỗi lần load web: cào + lưu DB (giống /api/cron). Best-effort: lỗi (mạng/DB)
  // thì bỏ qua, vẫn render data đang có trong DB.
  try {
    await scrapeAndStore(cfg);
  } catch {
    // ignore
  }

  let initialPrice: PricePayload | null = null;
  let initialHistory: HistoryEntry[] = [];
  try {
    [initialPrice, initialHistory] = await Promise.all([getCurrentPrice(cfg), getHistory(cfg)]);
  } catch {
    // DB chưa sẵn sàng -> client sẽ tự fetch /api/price + /api/history
  }

  return <PriceView initialPrice={initialPrice} initialHistory={initialHistory} />;
}
