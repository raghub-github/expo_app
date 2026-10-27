import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { cachedQuery } from "@/lib/api-cache";
import { fetchMerchants } from "@/lib/db/metrics";
import { parsePeriod } from "@/lib/period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const period = parsePeriod(request.nextUrl.searchParams.get("period"));
  return withAuth(() =>
    cachedQuery(`merchants:${period}`, 30_000, () => fetchMerchants(period))
  );
}
