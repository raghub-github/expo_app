import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { client as sql } from "@/lib/drizzle";
import { buildGrowthBusinessInsights } from "@/lib/merchant-growth/growth-business-insights";
import { withRouteTimeout, RouteTimeoutError } from "@/lib/route-timeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/merchant/growth/business-insights?storeId=GMMC1015&period=week */
export async function GET(req: NextRequest) {
  try {
    return await withRouteTimeout("merchant.growth.business-insights", 30_000, async () => {
      const storeId =
        req.nextUrl.searchParams.get("storeId") ?? req.nextUrl.searchParams.get("store_id");
      if (!storeId?.trim()) {
        return NextResponse.json({ error: "storeId is required" }, { status: 400 });
      }

      const gate = await assertStoreAccess(storeId.trim());
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }

      const raw = String(req.nextUrl.searchParams.get("period") ?? "week").toLowerCase();
      const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "week";

      const body = await buildGrowthBusinessInsights(sql, gate.storeIdNum, period);
      return NextResponse.json(body);
    });
  } catch (e) {
    if (e instanceof RouteTimeoutError) {
      console.warn("[merchant/growth/business-insights] timeout after", e.ms, "ms");
      return NextResponse.json({ error: "timeout" }, { status: 504 });
    }
    console.error("[merchant/growth/business-insights]", e);
    return NextResponse.json({ error: "Failed to load business insights" }, { status: 500 });
  }
}
