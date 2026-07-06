import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { client as sql } from "@/lib/drizzle";
import { getCachedLivePreviewInsights } from "@/lib/merchant-growth/cached-growth-insights";
import { withRouteTimeout, RouteTimeoutError } from "@/lib/route-timeout";
import { peekGrowthCache } from "@/lib/growth-insights-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/merchant/growth/live-preview?storeId=GMMC1015&period=today&lite=1 */
export async function GET(req: NextRequest) {
  const storeId =
    req.nextUrl.searchParams.get("storeId") ?? req.nextUrl.searchParams.get("store_id");
  if (!storeId?.trim()) {
    return NextResponse.json({ error: "storeId is required" }, { status: 400 });
  }

  const gate = await assertStoreAccess(storeId.trim());
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const raw = String(req.nextUrl.searchParams.get("period") ?? "today").toLowerCase();
  const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";
  const lite = req.nextUrl.searchParams.get("lite") !== "0";
  const cacheKey = `live-preview-v3:${gate.storeIdNum}:${period}:${lite ? "lite" : "full"}`;

  try {
    return await withRouteTimeout("merchant.growth.live-preview", 20_000, async () => {
      const body = await getCachedLivePreviewInsights(sql, gate.storeIdNum, period, { lite });
      return NextResponse.json(body);
    });
  } catch (e) {
    if (e instanceof RouteTimeoutError) {
      const stale = peekGrowthCache(cacheKey);
      if (stale) {
        console.warn("[merchant/growth/live-preview] timeout — serving stale cache");
        return NextResponse.json(stale);
      }
      console.warn("[merchant/growth/live-preview] timeout after", e.ms, "ms");
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    console.error("[merchant/growth/live-preview]", e);
    return NextResponse.json({ error: "Failed to load live preview insights" }, { status: 500 });
  }
}
