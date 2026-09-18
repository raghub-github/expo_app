import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { fetchMerchantDetail } from "@/lib/db/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return withAuth(() => fetchMerchantDetail(id, request.nextUrl.searchParams.get("period")));
}
