import { after, NextResponse } from "next/server";
import { getStore } from "@/lib/stores";
import { getPrices } from "@/lib/queries";
import { triggerBackgroundRefresh } from "@/lib/refresh";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/price            -> mảng giá tất cả store: [{ store, store_name, price }, ...]
// GET /api/price?store=kimphat -> mảng lọc còn store đó (1 phần tử).
//
// FLOW POLL (app mở, không socket -> poll định kỳ — xem PROJECT_CONTEXT.md "Hai flow làm tươi data"):
//   1) Trả ngay data cache/DB cho client (nhanh, không chờ cào). `?store=` chỉ LỌC response.
//   2) Cào nền chạy SAU response qua after(): cào TẤT CẢ tiệm (cùng service scrapeAllStores như
//      /api/cron — KHÔNG phụ thuộc ?store=), không block client, Vercel giữ function sống tới khi
//      xong. Cooldown GLOBAL (Redis) trong triggerBackgroundRefresh chống cào dồn khi đông client.
export async function GET(req: Request) {
  const storeParam = new URL(req.url).searchParams.get("store");
  if (storeParam && !getStore(storeParam)) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  after(() => triggerBackgroundRefresh());

  const prices = await getPrices(storeParam);
  return NextResponse.json(prices, { headers: corsHeaders() });
}
