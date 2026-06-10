import { NextResponse } from "next/server";
import { scrapeAllStores } from "@/lib/scrape";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/refresh — cào THỦ CÔNG tất cả tiệm (nút reload web / mobile).
// Gọi thẳng scrapeAllStores() y như /api/cron: cào TẤT CẢ store (không phân biệt), không cooldown.
// Không cào trong /api/price nữa -> đọc/poll không ghi DB; cào chỉ khi bấm reload hoặc cron chạy.
// Cào xong client gọi lại GET /api/price + /api/history để lấy data mới.
export async function GET() {
  const results = await scrapeAllStores();
  return NextResponse.json({ count: results.length, results }, { headers: corsHeaders() });
}
