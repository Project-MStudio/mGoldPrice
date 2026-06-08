import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
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

// GET /api/price?store=kimphat — giá hiện tại: row mới nhất theo store_id, decode về JSON.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cfg = getStore(searchParams.get("store") ?? DEFAULT_STORE);
  if (!cfg) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  const db = getDb();
  const [latest] = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, cfg.storeId))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(1);

  return NextResponse.json(
    {
      store_id: cfg.storeId,
      store_name: cfg.name,
      created_at: latest?.createdAt ?? null,
      updated_at: latest?.updatedAt ?? null,
      data: latest ? decodeData(latest.dataString) : null,
    },
    { headers: corsHeaders() },
  );
}
