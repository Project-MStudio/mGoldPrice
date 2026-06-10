import * as cheerio from "cheerio";
import type { GoldData, GoldRow } from "@/lib/stores";

// ============================================================================
// [THỬ NGHIỆM] Cào giá vàng từ MIRROR mở giavang.org (sjc.com.vn bị Cloudflare chặn).
// MỌI brand dùng CHUNG 1 parser vì cấu trúc bảng giống hệt: [Khu vực | Loại vàng | Mua | Bán].
// Chỉ lấy KHU VỰC ĐẦU TIÊN của mỗi trang — nơi liệt kê ĐẦY ĐỦ các loại vàng của brand đó
// (các vùng sau chỉ lặp lại vài dòng). Giá nguồn "nghìn đồng" (vd "138.800") -> ×1000 full VND.
// CHƯA gắn vào STORES/cron — chỉ để /api/test-sjc xem cấu trúc. Chốt OK -> chuyển vào STORES + seed.
// ============================================================================

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// Brand có trên giavang.org: key (storeId dự kiến) -> { name, slug (đường dẫn) }.
// LƯU Ý: "mi-hong" KHÔNG thêm ở đây vì đã có store `mihong` cào từ api.mihong.vn (tránh trùng).
export const GIAVANG_BRANDS: Record<string, { name: string; slug: string }> = {
  sjc: { name: "SJC", slug: "sjc" },
  doji: { name: "DOJI", slug: "doji" },
  pnj: { name: "PNJ", slug: "pnj" },
  btmc: { name: "Bảo Tín Minh Châu", slug: "bao-tin-minh-chau" },
  btmh: { name: "Bảo Tín Mạnh Hải", slug: "bao-tin-manh-hai" },
  phuquy: { name: "Phú Quý", slug: "phu-quy" },
  ngoctham: { name: "Ngọc Thẩm", slug: "ngoc-tham" },
};

// "138.800" (nghìn đồng, chấm ngăn nghìn) -> "138,800,000" (full VND). "0"/rỗng/lỗi -> "0".
function normPrice(raw: string): string {
  const n = Number(raw.replace(/[.\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? (n * 1000).toLocaleString("en-US") : "0";
}

// "Cập nhật lúc 20:55:02 09/06/2026" -> "09/06/2026 20:55" (khớp GoldRow.time = "DD/MM/YYYY HH:mm").
function parseUpdatedAt(text: string): string {
  const m = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
  return m ? `${m[3]} ${m[1].padStart(2, "0")}:${m[2]}` : "";
}

// Parser CHUNG cho mọi trang brand giavang.org.
export function parseGiavangBrand(html: string): GoldData {
  const $ = cheerio.load(html);
  const time = parseUpdatedAt($("body").text().replace(/\s+/g, " "));
  const domestic: GoldRow[] = [];

  let region = "";
  let firstRegion = "";
  $("table")
    .first()
    .find("tr")
    .each((_, tr) => {
      const c = $(tr)
        .find("th,td")
        .map((_, x) => $(x).text().trim().replace(/\s+/g, " "))
        .get();
      if (c[0] === "Khu vực" || c.length < 3) return; // header / dòng "Cập nhật lúc..."

      let name: string;
      let buy: string;
      let sell: string;
      if (c.length >= 4) {
        region = c[0]; // dòng mở đầu 1 khu vực: [Khu vực, Loại, Mua, Bán]
        if (!firstRegion) firstRegion = region;
        name = c[1];
        buy = c[2];
        sell = c[3];
      } else {
        name = c[0]; // dòng tiếp cùng khu vực (rowspan): [Loại, Mua, Bán]
        buy = c[1];
        sell = c[2];
      }

      if (region !== firstRegion) return; // chỉ giữ khu vực đầu tiên (đủ loại nhất)
      domestic.push({ name, buy: normPrice(buy), sell: normPrice(sell), time });
    });

  return { domestic, world: [] };
}

export async function fetchGiavangBrand(key: string): Promise<GoldData> {
  const brand = GIAVANG_BRANDS[key];
  if (!brand) throw new Error(`Unknown giavang brand: ${key}`);
  const res = await fetch(`https://giavang.org/trong-nuoc/${brand.slug}/`, {
    headers: { "User-Agent": UA },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`giavang.org ${key} fetch failed: ${res.status}`);
  return parseGiavangBrand(await res.text());
}
