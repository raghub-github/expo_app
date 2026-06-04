import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { buildGrowthBusinessInsights } from "@/lib/merchant-growth/growth-business-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/merchant/stores/[id]/growth/business-insights?period=week */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const storeId = Number(id);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
    }

    const raw = req.nextUrl.searchParams.get("period")?.toLowerCase() ?? "week";
    const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "week";

    const sql = getSql();
    const body = await buildGrowthBusinessInsights(sql, storeId, period);
    return NextResponse.json(body);
  } catch (e) {
    console.error("[stores/growth/business-insights]", e);
    return NextResponse.json({ error: "Failed to load business insights" }, { status: 500 });
  }
}
