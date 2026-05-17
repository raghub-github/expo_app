/**
 * GET /api/merchant/stores/[id]/reviews?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Same tables as partnersite: merchant_store_ratings, customers, orders_food, orders_core
 */
import { NextResponse } from "next/server";
import { assertStoreAccess } from "@/app/api/merchant/stores/[id]/menu/assert-store-access";
import {
  fetchUserInsightReviews,
  parseYmdBound,
} from "@/lib/merchant-user-insights";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 },
      );
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status },
      );
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const from = fromParam ? parseYmdBound(fromParam, false) : null;
    const to = toParam ? parseYmdBound(toParam, true) : null;

    const { reviews, stats } = await fetchUserInsightReviews(storeId, from, to);

    return NextResponse.json({ success: true, reviews, stats });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Failed to fetch reviews.") {
      return NextResponse.json(
        { success: false, error: msg },
        { status: 500 },
      );
    }
    console.error("[GET /api/merchant/stores/[id]/reviews]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
