import { NextRequest, NextResponse } from "next/server";
import { requireRiderApiAuth, riderAuthFailureResponse } from "@/lib/auth/require-rider-api-auth";
import {
  aggregateRiderCancellationCounts,
  RIDER_ANALYTICS_SERVICES,
} from "@/lib/riders/rider-cancellation-analytics.query";
import { computeRiderCancellationAnalytics } from "@/lib/riders/rider-cancellation-analytics";

export const runtime = "nodejs";

/**
 * GET /api/riders/:id/cancellation-analytics?from=&to=
 *
 * Rider-scoped cancellation analytics: service-wise + overall cancellation rate,
 * rider-fault rate/share, and pre/post-pickup responsibility breakdown. All figures
 * are computed from aggregated counts on the backend (never averaged, never client-side).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRiderApiAuth(request);
    if (!auth.ok) return riderAuthFailureResponse(auth);

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (Number.isNaN(riderId) || riderId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const aggregation = await aggregateRiderCancellationCounts({ riderId, from, to });
    const analytics = computeRiderCancellationAnalytics({
      services: [...RIDER_ANALYTICS_SERVICES],
      accepted: aggregation.accepted,
      cancellations: aggregation.cancellations,
    });

    return NextResponse.json({
      success: true,
      riderId,
      period: { from: from ?? null, to: to ?? null },
      ...analytics,
      dataQuality: {
        unknownServiceOrders: aggregation.unknownServiceOrders,
        reconciliationErrors: analytics.reconciliationErrors ?? [],
      },
    });
  } catch (error) {
    console.error("[cancellation-analytics] failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute cancellation analytics" },
      { status: 500 }
    );
  }
}
