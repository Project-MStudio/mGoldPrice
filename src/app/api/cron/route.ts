import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";
import { DEFAULT_STORE, getStore } from "@/lib/stores";
import { encodeData } from "@/lib/encode";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
  // --- Auth bằng CRON_SECRET (header x-cron-secret hoặc Authorization: Bearer) ---
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (!process.env.CRON_SECRET || provided !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  // --- Resolve store theo định danh (mặc định kimphat) ---
  const { searchParams } = new URL(req.url);
  const storeParam = searchParams.get("store") ?? DEFAULT_STORE;
  const cfg = getStore(storeParam);
  if (!cfg) {
    return NextResponse.json(
      { error: `Unknown store: ${storeParam}` },
      { status: 404, headers: corsHeaders() },
    );
  }

  // --- Cào + parse + encode ---
  let html: string;
  try {
    const res = await fetch(cfg.website, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch source failed: ${res.status}` },
        { status: 502, headers: corsHeaders() },
      );
    }
    html = await res.text();
  } catch (err) {
    return NextResponse.json(
      { error: `Fetch source error: ${(err as Error).message}` },
      { status: 502, headers: corsHeaders() },
    );
  }

  const parsed = cfg.parse(html);
  const encoded = encodeData(parsed);

  // --- So khớp với lần lưu trước CỦA CÙNG store_id ---
  const db = getDb();
  const [latest] = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.storeId, cfg.storeId))
    .orderBy(desc(priceHistory.createdAt), desc(priceHistory.id))
    .limit(1);

  let changed: boolean;
  let action: "insert" | "update";

  // latest.dataString đã là chuỗi canonical (cùng hàm encode) -> so sánh trực tiếp
  // tương đương decode rồi compare, nhưng deterministic & rẻ hơn.
  if (!latest || latest.dataString !== encoded) {
    await db.insert(priceHistory).values({ storeId: cfg.storeId, dataString: encoded });
    changed = true;
    action = "insert";
  } else {
    // GIỐNG -> ghi đè row mới nhất, refresh updated_at (không tạo row mới)
    await db
      .update(priceHistory)
      .set({ dataString: encoded, updatedAt: new Date() })
      .where(eq(priceHistory.id, latest.id));
    changed = false;
    action = "update";
  }

  return NextResponse.json(
    { store_id: cfg.storeId, changed, action, data: parsed },
    { headers: corsHeaders() },
  );
}
