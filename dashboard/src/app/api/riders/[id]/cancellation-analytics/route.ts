import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
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
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const userIsSuperAdmin = await isSuperAdmin(user.id, user.email ?? "");
    const hasRiderAccess = await hasDashboardAccessByAuth(user.id, user.email ?? "", "RIDER");
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        { status: 403 }
      );
    }

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
