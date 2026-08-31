import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { fetchOverview } from "@/lib/db/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period");
  return withAuth(() => fetchOverview(period));
}
