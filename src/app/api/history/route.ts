import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";
import { DEFAULT_STORE, getStore } from "@/lib/stores";
import { decodeData } from "@/lib/encode";
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

  const db = getDb();
  const rows = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, cfg.storeId))
    .orderBy(asc(priceHistory.createdAt), asc(priceHistory.id));

  const history = rows.map((r) => ({
    id: r.id,
    store_id: r.storeId,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    data: decodeData(r.dataString),
  }));

  return NextResponse.json(
    { store_id: cfg.storeId, store_name: cfg.name, count: history.length, history },
    { headers: corsHeaders() },
  );
}
