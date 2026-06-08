import * as cheerio from "cheerio";

export interface GoldRow {
  name: string;
  buy: string;
  sell: string;
  time: string;
}

export interface GoldData {
  domestic: GoldRow[];
  world: GoldRow[];
  [key: string]: unknown;
}

export interface StoreConfig {
  /** == store.store_id (PK) và là định danh dùng ở API (?store=...). */
  storeId: string;
  name: string;
  /** Trang hiển thị cho người dùng (lưu ở bảng store). Nguồn cào thật nằm trong fetchData. */
  website: string;
  /** Mỗi store tự fetch nguồn (HTML hoặc API JSON) + parse -> GoldData. */
  fetchData: () => Promise<GoldData>;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// ---------------- Kim Phát: cào HTML tĩnh (server-render) ----------------
// 2 x table.table; phân biệt bằng <thead th[scope=col]> đầu: "VÀNG TRONG NƯỚC" | "VÀNG THẾ GIỚI".
// mỗi tr: th.column-type div:first = tên, div.time = thời điểm, 2 x td.column-price .price = mua/bán.
function parseKimPhat(html: string): GoldData {
  const $ = cheerio.load(html);
  const data: GoldData = { domestic: [], world: [] };
  $("table.table").each((_, table) => {
    const header = $(table).find("thead th[scope='col']").first().text().trim().toUpperCase();
    const bucket = header.includes("THẾ GIỚI") ? data.world : data.domestic;
    $(table)
      .find("tbody tr")
      .each((_, tr) => {
        const typeCell = $(tr).find("th.column-type");
        const name = typeCell.find("div").first().text().trim();
        if (!name) return;
        const time = typeCell.find("div.time").text().trim();
        const prices = $(tr).find("td.column-price .price");
        const buy = $(prices.get(0)).text().trim();
        const sell = $(prices.get(1)).text().trim();
        bucket.push({ name, buy, sell, time });
      });
  });
  return data;
}

async function fetchKimPhat(): Promise<GoldData> {
  const res = await fetch("https://kimphat.evosoft.vn/", {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kim Phát fetch failed: ${res.status}`);
  return parseKimPhat(await res.text());
}

// ---------------- Mi Hồng: trang là SPA (JS-render), cào API JSON thay HTML ----------------
// GET https://api.mihong.vn/v1/gold-prices?market=domestic  (header x-market: mihong)
// trả mảng item { code, buyingPrice, sellingPrice, dateTime, ... } -> map vào domestic.
interface MihongItem {
  code: string;
  buyingPrice: number;
  sellingPrice: number;
  dateTime: string;
}

function mapMihong(items: MihongItem[]): GoldData {
  return {
    domestic: items.map((it) => ({
      name: it.code,
      buy: it.buyingPrice.toLocaleString("en-US"),
      sell: it.sellingPrice.toLocaleString("en-US"),
      time: it.dateTime,
    })),
    world: [],
  };
}

async function fetchMihong(): Promise<GoldData> {
  const res = await fetch("https://api.mihong.vn/v1/gold-prices?market=domestic", {
    headers: {
      accept: "*/*",
      "content-type": "application/json",
      "x-market": "mihong",
      origin: "https://www.mihong.vn",
      referer: "https://www.mihong.vn/",
      "User-Agent": UA,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Mi Hồng API failed: ${res.status}`);
  const items = (await res.json()) as MihongItem[];
  return mapMihong(items);
}

// Registry: thêm tiệm mới = thêm 1 entry + insert row store + chạy cron với ?store=<key>.
export const STORES: Record<string, StoreConfig> = {
  kimphat: {
    storeId: "kimphat",
    name: "Kim Phát",
    website: "https://kimphat.evosoft.vn/",
    fetchData: fetchKimPhat,
  },
  mihong: {
    storeId: "mihong",
    name: "Mi Hồng",
    website: "https://www.mihong.vn/gia-vang-trong-nuoc",
    fetchData: fetchMihong,
  },
};

export const DEFAULT_STORE = "kimphat";

export function getStore(id?: string | null): StoreConfig | undefined {
  return STORES[(id || DEFAULT_STORE).toLowerCase()];
}
