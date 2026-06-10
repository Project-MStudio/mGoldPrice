import { NextResponse } from "next/server";
import { fetchGiavangBrand, GIAVANG_BRANDS } from "@/lib/scrape-giavang";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// [THỬ NGHIỆM] GET /api/test-sjc — cào giá vàng từ mirror giavang.org, trả GoldData để xem cấu trúc.
//   ?brand=<key>  -> 1 brand (mặc định sjc). key: sjc|doji|pnj|btmc|btmh|phuquy|ngoctham
//   ?brand=all    -> tất cả brand (mỗi phần tử { brand, name, count, data } hoặc { ..., error })
// CHƯA gắn vào STORES/cron. Chốt OK -> chuyển fetchGiavangBrand vào STORES + seed rồi xoá route này.
export async function GET(req: Request) {
  const brand = new URL(req.url).searchParams.get("brand") ?? "sjc";

  if (brand === "all") {
    const brands = await Promise.all(
      Object.entries(GIAVANG_BRANDS).map(async ([key, b]) => {
        try {
          const data = await fetchGiavangBrand(key);
          return { brand: key, name: b.name, count: data.domestic.length, data };
        } catch (err) {
          return { brand: key, name: b.name, error: (err as Error).message };
        }
      }),
    );
    return NextResponse.json({ source: "giavang.org", brands }, { headers: corsHeaders() });
  }

  if (!GIAVANG_BRANDS[brand]) {
    return NextResponse.json(
      { error: `Unknown brand: ${brand}. Hợp lệ: ${Object.keys(GIAVANG_BRANDS).join(", ")}, all` },
      { status: 404, headers: corsHeaders() },
    );
  }

  try {
    const data = await fetchGiavangBrand(brand);
    return NextResponse.json(
      { source: `giavang.org/trong-nuoc/${GIAVANG_BRANDS[brand].slug}`, brand, count: data.domestic.length, data },
      { headers: corsHeaders() },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502, headers: corsHeaders() });
  }
}
