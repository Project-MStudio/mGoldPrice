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
  website: string;
  parse: (html: string) => GoldData;
}

// --- Parser cho Kim Phát (https://kimphat.evosoft.vn/) ---
// Cấu trúc DOM (đã verify HTML thật, server-render, KHÔNG phải JS):
//   2 x <table class="table">; phân biệt bằng text <thead th[scope=col]> đầu tiên:
//     "VÀNG TRONG NƯỚC" (domestic) | "VÀNG THẾ GIỚI" (world)
//   mỗi dòng <tbody><tr>:
//     th.column-type > div:first  -> tên loại vàng
//     th.column-type div.time     -> thời điểm
//     td.column-price thứ 1 .price -> giá mua
//     td.column-price thứ 2 .price -> giá bán
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

// Registry: thêm tiệm mới (mihong, doji, pnj...) = thêm 1 entry ở đây + insert row store
// + chạy external cron với ?store=<key>. Core code (cron/price/history) không đổi.
export const STORES: Record<string, StoreConfig> = {
  kimphat: {
    storeId: "kimphat",
    name: "Kim Phát",
    website: "https://kimphat.evosoft.vn/",
    parse: parseKimPhat,
  },
};

export const DEFAULT_STORE = "kimphat";

export function getStore(id?: string | null): StoreConfig | undefined {
  return STORES[(id || DEFAULT_STORE).toLowerCase()];
}
