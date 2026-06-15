import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSql } from "@/lib/db/client";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
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
      return NextResponse.json({ success: false, error: "Insufficient permissions." }, { status: 403 });
    }

    const { id } = await params;
    const riderId = parseInt(id, 10);
    if (!Number.isFinite(riderId) || riderId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid rider ID" }, { status: 400 });
    }

    const sql = getSql();
    const rows = await sql`
      SELECT
        rider_id,
        offers_total,
        offers_accepted,
        offers_rejected,
        offers_missed,
        last_offer_at,
        last_accepted_at,
        updated_at
      FROM rider_dispatch_offer_stats
      WHERE rider_id = ${riderId}
      LIMIT 1
    `;

    const row = (rows as Array<Record<string, unknown>>)[0];
    const offersTotal = Number(row?.offers_total ?? 0);
    const offersAccepted = Number(row?.offers_accepted ?? 0);
    const offersRejected = Number(row?.offers_rejected ?? 0);
    const offersMissed = Number(row?.offers_missed ?? 0);

    return NextResponse.json({
      success: true,
      data: {
        riderId,
        offersTotal,
        offersAccepted,
        offersRejected,
        offersMissed,
        acceptRate:
          offersTotal > 0 ? Math.round((offersAccepted / offersTotal) * 1000) / 10 : null,
        lastOfferAt: row?.last_offer_at != null ? String(row.last_offer_at) : null,
        lastAcceptedAt: row?.last_accepted_at != null ? String(row.last_accepted_at) : null,
        updatedAt: row?.updated_at != null ? String(row.updated_at) : null,
      },
    });
  } catch (error) {
    console.error("[GET /api/riders/[id]/dispatch-offer-stats]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
