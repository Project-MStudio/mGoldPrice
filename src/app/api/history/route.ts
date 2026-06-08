import { NextResponse } from "next/server";
import { getStore } from "@/lib/stores";
import { getHistories } from "@/lib/queries";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/history            -> mảng [{ store, store_name, history: [...] }, ...] (tất cả store)
// GET /api/history?store=kimphat -> mảng lọc còn store đó (1 phần tử)
export async function GET(req: Request) {
  const storeParam = new URL(req.url).searchParams.get("store");
  if (storeParam && !getStore(storeParam)) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  const histories = await getHistories(storeParam);
  return NextResponse.json(histories, { headers: corsHeaders() });
}
