import { NextResponse } from "next/server";
import { getStore } from "@/lib/stores";
import { getHistories } from "@/lib/queries";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/history/{store} -> 1 object { store, store_name, history: [...] } cho đúng store đó.
export async function GET(_req: Request, { params }: { params: Promise<{ store: string }> }) {
  const { store } = await params;
  if (!getStore(store)) {
    return NextResponse.json({ error: "Unknown store" }, { status: 404, headers: corsHeaders() });
  }

  const [entry] = await getHistories(store);
  return NextResponse.json(entry, { headers: corsHeaders() });
}
