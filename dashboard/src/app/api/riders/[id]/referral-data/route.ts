/**
 * GET /api/riders/[id]/referral-data
 * Returns referral summary + list of referred riders with fulfillment details, order counts, amounts.
 * Query: from, to (date), cityId, offerId, status (fulfillment), limit, offset
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db/client";
import {
  riders,
  referrals,
  referralOffers,
  referralFulfillments,
  orders,
} from "@/lib/db/schema";
import { eq, and, desc, gte, lte, sql, inArray, or, isNull, ilike } from "drizzle-orm";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError || !session) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userIsSuperAdmin = await isSuperAdmin(
      session.user.id,
      session.user.email!
    );
    const hasRiderAccess = await hasDashboardAccessByAuth(
      session.user.id,
      session.user.email!,
      "RIDER"
    );
    if (!userIsSuperAdmin && !hasRiderAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. RIDER dashboard access required.",
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const riderId = parseInt(id);
    if (isNaN(riderId)) {
      return NextResponse.json(
        { success: false, error: "Invalid rider ID" },
        { status: 400 }
      );
    }

    const db = getDb();

    const [riderRow] = await db
      .select({
        id: riders.id,
        name: riders.name,
        mobile: riders.mobile,
        referralCode: riders.referralCode,
        referredBy: riders.referredBy,
      })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    if (!riderRow) {
      return NextResponse.json(
        { success: false, error: "Rider not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const cityIdParam = searchParams.get("cityId");
    const cityNameParam = searchParams.get("cityName")?.trim() || null;
    const offerIdParam = searchParams.get("offerId");
    const statusParam = searchParams.get("status");
    const qParam = searchParams.get("q")?.trim() || null;
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20)
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get("offset") || "0", 10) || 0
    );

    const cityId =
      cityIdParam && /^\d+$/.test(cityIdParam)
        ? parseInt(cityIdParam, 10)
        : null;
    const offerId =
      offerIdParam && /^\d+$/.test(offerIdParam)
        ? parseInt(offerIdParam, 10)
        : null;

    const conditions = [eq(referrals.referrerId, riderId)];
    if (from) conditions.push(gte(referrals.createdAt, new Date(from)));
    if (to) conditions.push(lte(referrals.createdAt, new Date(to)));
    if (cityId !== null)
      conditions.push(eq(referrals.referredCityId, cityId));
    if (cityNameParam)
      conditions.push(ilike(referrals.referredCityName, `%${cityNameParam}%`));
    if (offerId !== null) conditions.push(eq(referrals.offerId, offerId));
    if (statusParam) {
      if (statusParam === "pending") {
        conditions.push(
          or(
            isNull(referralFulfillments.id),
            eq(referralFulfillments.status, "pending")
          )!
        );
      } else {
        conditions.push(
          eq(referralFulfillments.status, statusParam as "fulfilled" | "credited" | "expired" | "cancelled")
        );
      }
    }
    if (qParam) {
      const num = parseInt(qParam, 10);
      const isNumeric = !Number.isNaN(num) && String(num) === qParam.trim();
      if (isNumeric) {
        conditions.push(eq(riders.id, num));
      } else {
        conditions.push(
          or(
            ilike(riders.name, `%${qParam}%`),
            ilike(riders.mobile, `%${qParam}%`)
          )!
        );
      }
    }

    const [filteredCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .leftJoin(referralFulfillments, eq(referrals.id, referralFulfillments.referralId))
      .innerJoin(riders, eq(referrals.referredId, riders.id))
      .where(and(...conditions));
    const totalFiltered = filteredCountRow?.count ?? 0;

    const referralsList = await db
      .select({
        referralId: referrals.id,
        referredId: referrals.referredId,
        offerId: referrals.offerId,
        referralCodeUsed: referrals.referralCodeUsed,
        referredCityId: referrals.referredCityId,
        referredCityName: referrals.referredCityName,
        createdAt: referrals.createdAt,
        offerCode: referralOffers.offerCode,
        offerName: referralOffers.name,
        offerType: referralOffers.offerType,
        minOrdersPerReferred: referralOffers.minOrdersPerReferred,
        termsAndConditions: referralOffers.termsAndConditions,
        termsSnapshot: referralOffers.termsSnapshot,
        referredName: riders.name,
        referredMobile: riders.mobile,
        fulfillmentId: referralFulfillments.id,
        fulfillmentStatus: referralFulfillments.status,
        ordersCompletedByReferred: referralFulfillments.ordersCompletedByReferred,
        ordersCompletedFood: referralFulfillments.ordersCompletedFood,
        ordersCompletedParcel: referralFulfillments.ordersCompletedParcel,
        ordersCompletedPersonRide:
          referralFulfillments.ordersCompletedPersonRide,
        amountCredited: referralFulfillments.amountCredited,
        amountCreditedFood: referralFulfillments.amountCreditedFood,
        amountCreditedParcel: referralFulfillments.amountCreditedParcel,
        amountCreditedPersonRide:
          referralFulfillments.amountCreditedPersonRide,
        creditedAt: referralFulfillments.creditedAt,
        fulfilledAt: referralFulfillments.fulfilledAt,
        fulfillmentCityName: referralFulfillments.cityName,
        fulfillmentTermsSnapshot: referralFulfillments.termsSnapshot,
      })
      .from(referrals)
      .leftJoin(referralOffers, eq(referrals.offerId, referralOffers.id))
      .leftJoin(
        referralFulfillments,
        eq(referrals.id, referralFulfillments.referralId)
      )
      .innerJoin(riders, eq(referrals.referredId, riders.id))
      .where(and(...conditions))
      .orderBy(desc(referrals.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const referredIds = referralsList.map((r) => r.referredId);
    let orderCounts: Record<
      number,
      {
        total: number;
        food: number;
        parcel: number;
        person_ride: number;
      }
    > = {};
    if (referredIds.length > 0) {
      const counts = await db
        .select({
          riderId: orders.riderId,
          total: sql<number>`count(*)::int`,
          food: sql<number>`count(*) filter (where ${orders.orderType} = 'food')::int`,
          parcel: sql<number>`count(*) filter (where ${orders.orderType} = 'parcel')::int`,
          personRide: sql<number>`count(*) filter (where ${orders.orderType} = 'person_ride')::int`,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.riderId, referredIds),
            eq(orders.status, "delivered")
          )
        )
        .groupBy(orders.riderId);

      counts.forEach((c) => {
        if (c.riderId != null) {
          orderCounts[c.riderId] = {
            total: c.total ?? 0,
            food: c.food ?? 0,
            parcel: c.parcel ?? 0,
            person_ride: c.personRide ?? 0,
          };
        }
      });
    }

    const totalReferredCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(eq(referrals.referrerId, riderId));

    const totalCredited = await db
      .select({
        sum: sql<string>`coalesce(sum(${referralFulfillments.amountCredited}), 0)`,
      })
      .from(referralFulfillments)
      .where(eq(referralFulfillments.referrerRiderId, riderId));

    const items = referralsList.slice(0, limit).map((r) => {
      const currentOrders = orderCounts[r.referredId] ?? {
        total: 0,
        food: 0,
        parcel: 0,
        person_ride: 0,
      };
      return {
        referralId: r.referralId,
        referredRiderId: r.referredId,
        referredRiderName: r.referredName,
        referredMobile: r.referredMobile,
        referredAt: r.createdAt,
        cityName: r.referredCityName ?? r.fulfillmentCityName ?? null,
        offerCode: r.offerCode,
        offerName: r.offerName,
        offerType: r.offerType,
        minOrdersRequired: r.minOrdersPerReferred ?? 0,
        ordersCompletedTotal: r.ordersCompletedByReferred ?? 0,
        ordersCompletedFood: r.ordersCompletedFood ?? 0,
        ordersCompletedParcel: r.ordersCompletedParcel ?? 0,
        ordersCompletedPersonRide: r.ordersCompletedPersonRide ?? 0,
        currentOrderCountTotal: currentOrders.total,
        currentOrderCountFood: currentOrders.food,
        currentOrderCountParcel: currentOrders.parcel,
        currentOrderCountPersonRide: currentOrders.person_ride,
        fulfillmentStatus: r.fulfillmentStatus ?? "pending",
        offerFulfilled:
          (r.fulfillmentStatus === "fulfilled" ||
            r.fulfillmentStatus === "credited") ?? false,
        amountCredited: r.amountCredited ?? "0",
        amountCreditedFood: r.amountCreditedFood ?? "0",
        amountCreditedParcel: r.amountCreditedParcel ?? "0",
        amountCreditedPersonRide: r.amountCreditedPersonRide ?? "0",
        creditedAt: r.creditedAt,
        fulfilledAt: r.fulfilledAt,
        termsAndConditions: r.termsAndConditions ?? null,
        termsSnapshot: r.fulfillmentTermsSnapshot ?? r.termsSnapshot ?? {},
      };
    });

    const hasMore = referralsList.length > limit;

    return NextResponse.json({
      success: true,
      data: {
        rider: {
          id: riderRow.id,
          name: riderRow.name,
          mobile: riderRow.mobile,
          referralCode: riderRow.referralCode,
          referredBy: riderRow.referredBy,
        },
        totalReferredCount: totalReferredCount[0]?.count ?? 0,
        totalAmountCredited: totalCredited[0]?.sum ?? "0",
        list: items,
        total: totalFiltered,
        hasMore,
        limit,
        offset,
      },
    });
  } catch (err) {
    console.error("[GET /api/riders/[id]/referral-data]", err);
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error ? err.message : "Failed to load referral data",
      },
      { status: 500 }
    );
  }
}
