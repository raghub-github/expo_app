import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { fetchSupport } from "@/lib/db/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(() => fetchSupport(request.nextUrl.searchParams.get("period")));
}
