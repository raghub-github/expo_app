/**
 * POST /api/merchant/stores/[id]/reviews/respond
 * Body: { reviewId: number, message?: string, images?: string[] }
 * Updates merchant_store_ratings — same as partnersite.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "@/app/api/merchant/stores/[id]/menu/assert-store-access";
import { respondToUserInsightReview } from "@/lib/merchant-user-insights";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
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

    const body = await request.json().catch(() => ({}));
    const reviewId = Number(body.reviewId);
    const message = typeof body.message === "string" ? body.message : undefined;
    const images = Array.isArray(body.images)
      ? body.images.filter((x: unknown) => typeof x === "string")
      : undefined;

    if (!Number.isFinite(reviewId)) {
      return NextResponse.json(
        { success: false, error: "reviewId required" },
        { status: 400 },
      );
    }

    if (!message?.trim() && (!images || images.length === 0)) {
      return NextResponse.json(
        {
          success: false,
          error: "Review ID and either message or images are required.",
        },
        { status: 400 },
      );
    }

    const { review } = await respondToUserInsightReview(
      storeId,
      reviewId,
      message,
      images,
    );

    return NextResponse.json({
      success: true,
      message: "Response saved successfully.",
      review,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "REVIEW_NOT_FOUND") {
      return NextResponse.json(
        { success: false, error: "Review not found." },
        { status: 404 },
      );
    }
    if (msg === "FORBIDDEN") {
      return NextResponse.json(
        { success: false, error: "You don't have permission to respond to this review." },
        { status: 403 },
      );
    }
    if (msg === "Failed to save response.") {
      return NextResponse.json(
        { success: false, error: msg },
        { status: 500 },
      );
    }
    console.error("[POST /api/merchant/stores/[id]/reviews/respond]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
