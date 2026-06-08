import { NextResponse } from "next/server";
import { DEFAULT_STORE, getStore } from "@/lib/stores";
import { getHistory } from "@/lib/queries";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/history?store=kimphat — TẤT CẢ row theo store_id, decode từng cái, sort theo thời gian.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cfg = getStore(searchParams.get("store") ?? DEFAULT_STORE);
  if (!cfg) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  const history = await getHistory(cfg);
  return NextResponse.json(
    { store_id: cfg.storeId, store_name: cfg.name, count: history.length, history },
    { headers: corsHeaders() },
  );
}
