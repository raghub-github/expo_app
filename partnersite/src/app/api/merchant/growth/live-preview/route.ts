import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";
import { client as sql } from "@/lib/drizzle";
import { buildLivePreviewInsights } from "@/lib/merchant-growth/live-preview-insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/merchant/growth/live-preview?storeId=GMMC1015&period=today */
export async function GET(req: NextRequest) {
  try {
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

    const body = await buildLivePreviewInsights(sql, gate.storeIdNum, period);
    return NextResponse.json(body);
  } catch (e) {
    console.error("[merchant/growth/live-preview]", e);
    return NextResponse.json({ error: "Failed to load live preview insights" }, { status: 500 });
  }
}
