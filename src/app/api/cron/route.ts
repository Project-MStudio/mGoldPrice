import { NextResponse } from "next/server";
import { getStore } from "@/lib/stores";
import { getStores } from "@/lib/queries";
import { scrapeAndStore } from "@/lib/scrape";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const storeParam = new URL(req.url).searchParams.get("store");

  // --- Có ?store= : cào đúng 1 store (test/manual) ---
  if (storeParam) {
    const cfg = getStore(storeParam);
    if (!cfg) {
      return NextResponse.json(
        { error: `Unknown store: ${storeParam}` },
        { status: 404, headers: corsHeaders() },
      );
    }
    try {
      const result = await scrapeAndStore(cfg);
      return NextResponse.json(result, { headers: corsHeaders() });
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 502, headers: corsHeaders() },
      );
    }
  }

  // --- Không có ?store= : cào TẤT CẢ store trong bảng store (mặc định cho cron định kỳ) ---
  const stores = await getStores();
  const results = await Promise.all(
    stores.map(async (s) => {
      const cfg = getStore(s.store_id);
      if (!cfg) {
        // store có trong DB nhưng chưa đăng ký fetcher trong src/lib/stores.ts
        return { store_id: s.store_id, skipped: "no fetcher registered" };
      }
      try {
        return await scrapeAndStore(cfg);
      } catch (err) {
        return { store_id: s.store_id, error: (err as Error).message };
      }
    }),
  );

  return NextResponse.json({ count: results.length, results }, { headers: corsHeaders() });
}
