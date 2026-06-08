import { NextResponse } from "next/server";
import { openapiSpec } from "@/lib/openapi";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-static";

// GET /api/openapi.json — OpenAPI 3.1 spec cho các API.
export function GET() {
  return NextResponse.json(openapiSpec, { headers: corsHeaders() });
}
