import { NextResponse } from "next/server";
import { DEFAULT_STORE, getStore } from "@/lib/stores";
import { getCurrentPrice } from "@/lib/queries";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/price?store=kimphat — giá hiện tại: row mới nhất theo store_id, decode về JSON.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cfg = getStore(searchParams.get("store") ?? DEFAULT_STORE);
  if (!cfg) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  const payload = await getCurrentPrice(cfg);
  return NextResponse.json(payload, { headers: corsHeaders() });
}
