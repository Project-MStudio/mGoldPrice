import { NextResponse } from "next/server";
import { getStores } from "@/lib/queries";
import { corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// GET /api/stores — danh sách store đã đăng ký (từ bảng store).
export async function GET() {
  const stores = await getStores();
  return NextResponse.json({ count: stores.length, stores }, { headers: corsHeaders() });
}
