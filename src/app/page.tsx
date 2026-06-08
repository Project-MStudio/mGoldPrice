import { STORES } from "@/lib/stores";
import { scrapeAndStore } from "@/lib/scrape";
import { getStores, type StoreInfo } from "@/lib/queries";
import PriceView from "./price-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  // Mỗi lần load web: cào TẤT CẢ store best-effort (giống cron). Lỗi 1 store không chặn render.
  await Promise.all(Object.values(STORES).map((cfg) => scrapeAndStore(cfg).catch(() => {})));

  let stores: StoreInfo[] = [];
  try {
    stores = await getStores();
  } catch {
    // DB lỗi -> selector rỗng, client vẫn render khung
  }

  return <PriceView stores={stores} />;
}
