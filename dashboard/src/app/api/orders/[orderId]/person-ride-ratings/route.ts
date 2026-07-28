/**
 * GET /api/orders/[orderId]/person-ride-ratings
 * Person-ride only ratings (does not affect food order detail).
 *
 * Rider avg matches backend `getRiderAverageRating`:
 *   merchant_store_ratings.service_rating + ratings table.
 */

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

function parseId(param: string | null | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseId(orderIdParam);
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userEmail = user.email ?? "";
    const allowed =
      (await isSuperAdmin(user.id)) ||
      (await hasDashboardAccessByAuth(user.id, userEmail, "ORDER_PERSON_RIDE")) ||
      (await hasDashboardAccessByAuth(user.id, userEmail, "ORDER_FOOD"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const riderId = parseId(request.nextUrl.searchParams.get("riderId"));
    const customerId = parseId(request.nextUrl.searchParams.get("customerId"));
    const db = getDb();

    let riderAvgRating: number | null = null;
    let orderRiderRating: number | null = null;
    let riderRatingCount = 0;
    let customerAvgRating: number | null = null;
    let customerRatingCount = 0;

    // This-order captain rating (person rides store stars in service_rating)
    {
      const orderRows = await db.execute(sql`
        SELECT service_rating, rating
        FROM merchant_store_ratings
        WHERE order_id = ${orderId}
        ORDER BY created_at DESC
        LIMIT 1
      `);
      const orderRow = (orderRows as unknown as Record<string, unknown>[])[0];
      orderRiderRating = asNum(orderRow?.service_rating);
      if (orderRiderRating == null || orderRiderRating < 1) {
        orderRiderRating = null;
      }

      // Also check legacy ratings table for this order
      if (orderRiderRating == null && riderId) {
        const legacy = await db.execute(sql`
          SELECT rating
          FROM ratings
          WHERE order_id = ${orderId}
            AND rider_id = ${riderId}
            AND from_type = 'customer'
          ORDER BY created_at DESC
          LIMIT 1
        `);
        const leg = (legacy as unknown as Record<string, unknown>[])[0];
        const n = asNum(leg?.rating);
        orderRiderRating = n != null && n >= 1 ? n : null;
      }
    }

    if (riderId) {
      const avgRows = await db.execute(sql`
        WITH scores AS (
          SELECT msr.service_rating::numeric AS rating
          FROM merchant_store_ratings msr
          INNER JOIN orders_core oc ON oc.id = msr.order_id
          WHERE oc.rider_id = ${riderId}
            AND msr.service_rating IS NOT NULL
            AND msr.service_rating BETWEEN 1 AND 5
          UNION ALL
          SELECT r.rating::numeric AS rating
          FROM ratings r
          WHERE r.rider_id = ${riderId}
            AND r.from_type = 'customer'
            AND r.rating BETWEEN 1 AND 5
        )
        SELECT
          round(avg(rating)::numeric, 1) AS avg_rating,
          count(*)::int AS rating_count
        FROM scores
      `);
      const avgRow = (avgRows as unknown as Record<string, unknown>[])[0];
      riderAvgRating = asNum(avgRow?.avg_rating);
      riderRatingCount = Number(avgRow?.rating_count ?? 0) || 0;
    }

    if (customerId) {
      // Avg of overall stars this customer has left (store rating column),
      // plus any ratings.from_id rows — gives a passenger rating signal.
      const cxRows = await db.execute(sql`
        WITH scores AS (
          SELECT msr.rating::numeric AS rating
          FROM merchant_store_ratings msr
          WHERE msr.customer_id = ${customerId}
            AND msr.rating IS NOT NULL
            AND msr.rating BETWEEN 1 AND 5
          UNION ALL
          SELECT r.rating::numeric AS rating
          FROM ratings r
          WHERE r.from_type = 'customer'
            AND r.from_id = ${customerId}
            AND r.rating BETWEEN 1 AND 5
        )
        SELECT
          round(avg(rating)::numeric, 1) AS avg_rating,
          count(*)::int AS rating_count
        FROM scores
      `);
      const cx = (cxRows as unknown as Record<string, unknown>[])[0];
      customerAvgRating = asNum(cx?.avg_rating);
      customerRatingCount = Number(cx?.rating_count ?? 0) || 0;

      // Person-ride rows often only set service_rating (captain). If customer has no
      // overall store rating history, surface this order's service_rating as N/A for cx —
      // leave null rather than mislabeling captain stars as customer stars.
    }

    return NextResponse.json({
      success: true,
      data: {
        riderAvgRating,
        riderRatingCount,
        orderRiderRating,
        customerAvgRating,
        customerRatingCount,
      },
    });
  } catch (err) {
    console.error("[person-ride-ratings]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load ratings" },
      { status: 500 }
    );
  }
}
