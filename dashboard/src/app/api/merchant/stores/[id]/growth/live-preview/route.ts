import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { buildLivePreviewInsights } from "@/lib/merchant-growth/live-preview-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/merchant/stores/[id]/growth/live-preview?period=today */
export async function GET(req: NextRequest, ctx: RouteCtx) {
  try {
    const { id } = await ctx.params;
    const storeId = Number(id);
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
    }

    const raw = req.nextUrl.searchParams.get("period")?.toLowerCase() ?? "today";
    const period = ["today", "yesterday", "week", "month", "alltime"].includes(raw) ? raw : "today";

    const sql = getSql();
    const body = await buildLivePreviewInsights(sql, storeId, period);
    return NextResponse.json(body);
  } catch (e) {
    console.error("[stores/growth/live-preview]", e);
    return NextResponse.json({ error: "Failed to load live preview insights" }, { status: 500 });
  }
}
