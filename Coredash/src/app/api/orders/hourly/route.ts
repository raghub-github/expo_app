import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { fetchOrdersHourly } from "@/lib/db/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(() => fetchOrdersHourly(request.nextUrl.searchParams.get("date")));
}
