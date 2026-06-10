import { NextResponse } from "next/server";
import { getStore } from "@/lib/stores";
import { getPrices } from "@/lib/queries";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/price            -> mảng giá tất cả store: [{ store, store_name, price }, ...]
// GET /api/price?store=kimphat -> mảng lọc còn store đó (1 phần tử).
//
// CHỈ ĐỌC (cache/DB) — KHÔNG cào. Việc cào do: (1) /api/cron định kỳ, (2) /api/refresh thủ công
// (nút reload UI / mobile gọi). Tách cào khỏi đây để tránh ghi DB mỗi lần poll/đọc.
export async function GET(req: Request) {
  const storeParam = new URL(req.url).searchParams.get("store");
  if (storeParam && !getStore(storeParam)) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  const prices = await getPrices(storeParam);
  return NextResponse.json(prices, { headers: corsHeaders() });
}
