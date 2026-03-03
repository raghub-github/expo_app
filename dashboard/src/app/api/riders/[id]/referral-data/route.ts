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
  ordersCore,
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
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const userIsSuperAdmin = await isSuperAdmin(
      user.id,
      user.email ?? ""
    );
    const hasRiderAccess = await hasDashboardAccessByAuth(
      user.id,
      user.email ?? "",
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

    // Build conditions for referrals table query
    const referralConditions = [eq(referrals.referrerId, riderId)];
    if (from) referralConditions.push(gte(referrals.createdAt, new Date(from)));
    if (to) referralConditions.push(lte(referrals.createdAt, new Date(to)));
    if (cityId !== null)
      referralConditions.push(eq(referrals.referredCityId, cityId));
    if (cityNameParam)
      referralConditions.push(ilike(referrals.referredCityName, `%${cityNameParam}%`));
    if (offerId !== null) referralConditions.push(eq(referrals.offerId, offerId));
    if (statusParam) {
      if (statusParam === "pending") {
        referralConditions.push(
          or(
            isNull(referralFulfillments.id),
            eq(referralFulfillments.status, "pending")
          )!
        );
      } else {
        referralConditions.push(
          eq(referralFulfillments.status, statusParam as "fulfilled" | "credited" | "expired" | "cancelled")
        );
      }
    }
    if (qParam) {
      const num = parseInt(qParam, 10);
      const isNumeric = !Number.isNaN(num) && String(num) === qParam.trim();
      if (isNumeric) {
        referralConditions.push(eq(referrals.referredId, num));
      } else {
        referralConditions.push(
          or(
            ilike(riders.name, `%${qParam}%`),
            ilike(riders.mobile, `%${qParam}%`)
          )!
        );
      }
    }

    // Query referrals table (primary source)
    const [filteredCountRow] = await db
      .select({ count: sql<number>`count(distinct ${referrals.id})::int` })
      .from(referrals)
      .leftJoin(referralFulfillments, eq(referrals.id, referralFulfillments.referralId))
      .leftJoin(riders, eq(referrals.referredId, riders.id))
      .where(and(...referralConditions));
    const totalFilteredFromReferrals = filteredCountRow?.count ?? 0;

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
      .leftJoin(riders, eq(referrals.referredId, riders.id))
      .where(and(...referralConditions))
      .orderBy(desc(referrals.createdAt))
      .limit(limit + 1)
      .offset(offset);

    // Also query riders table where referred_by = riderId (fallback for missing referrals table data)
    const ridersConditions = [eq(riders.referredBy, riderId)];
    if (from) ridersConditions.push(gte(riders.createdAt, new Date(from)));
    if (to) ridersConditions.push(lte(riders.createdAt, new Date(to)));
    // Apply city name filter to riders.city column
    if (cityNameParam) ridersConditions.push(ilike(riders.city, `%${cityNameParam}%`));
    if (qParam) {
      const num = parseInt(qParam, 10);
      const isNumeric = !Number.isNaN(num) && String(num) === qParam.trim();
      if (isNumeric) {
        ridersConditions.push(eq(riders.id, num));
      } else {
        ridersConditions.push(
          or(
            ilike(riders.name, `%${qParam}%`),
            ilike(riders.mobile, `%${qParam}%`)
          )!
        );
      }
    }

    // Get referred riders from riders.referred_by that are NOT in referrals table
    const referredRiderIdsFromReferrals = new Set(
      referralsList.map((r) => r.referredId).filter((id): id is number => id != null)
    );

    // Get all referred riders from riders table
    const allReferredRidersFromRidersTable = await db
      .select({
        id: riders.id,
        name: riders.name,
        mobile: riders.mobile,
        createdAt: riders.createdAt,
        city: riders.city,
      })
      .from(riders)
      .where(and(...ridersConditions))
      .orderBy(desc(riders.createdAt));

    // Filter out riders already in referrals table and apply status filter
    let filteredRidersFromRidersTable = allReferredRidersFromRidersTable
      .filter((rider) => !referredRiderIdsFromReferrals.has(rider.id));

    // Apply status filter: riders from riders table have no fulfillment, so they're all "pending"
    if (statusParam && statusParam !== "pending") {
      // If filtering for fulfilled/credited/expired/cancelled, exclude riders from riders table
      filteredRidersFromRidersTable = [];
    }

    const referredRidersFromRidersTable = filteredRidersFromRidersTable.slice(0, limit + 1);

    // Combine referrals table data with riders.referred_by data
    const combinedReferralsList = [
      ...referralsList,
      ...referredRidersFromRidersTable.map((rider) => ({
        referralId: null as number | null, // No referral record exists
        referredId: rider.id,
        offerId: null as number | null,
        referralCodeUsed: null as string | null,
        referredCityId: null as number | null,
        referredCityName: rider.city ?? null,
        createdAt: rider.createdAt,
        offerCode: null as string | null,
        offerName: null as string | null,
        offerType: null as string | null,
        minOrdersPerReferred: null as number | null,
        termsAndConditions: null as string | null,
        termsSnapshot: null as Record<string, unknown> | null,
        referredName: rider.name,
        referredMobile: rider.mobile,
        fulfillmentId: null as number | null,
        fulfillmentStatus: null as string | null,
        ordersCompletedByReferred: null as number | null,
        ordersCompletedFood: null as number | null,
        ordersCompletedParcel: null as number | null,
        ordersCompletedPersonRide: null as number | null,
        amountCredited: null as string | null,
        amountCreditedFood: null as string | null,
        amountCreditedParcel: null as string | null,
        amountCreditedPersonRide: null as string | null,
        creditedAt: null as Date | null,
        fulfilledAt: null as Date | null,
        fulfillmentCityName: null as string | null,
        fulfillmentTermsSnapshot: null as Record<string, unknown> | null,
      })),
    ].sort((a, b) => {
      // Sort by createdAt descending
      const dateA = a.createdAt?.getTime() ?? 0;
      const dateB = b.createdAt?.getTime() ?? 0;
      return dateB - dateA;
    });

    // Calculate total filtered count properly including status filter
    const totalFiltered = totalFilteredFromReferrals + filteredRidersFromRidersTable.length;

    const referredIds = combinedReferralsList.map((r) => r.referredId).filter((id): id is number => id != null);
    let orderCounts: Record<
      number,
      {
        total: number;
        food: number;
        parcel: number;
        person_ride: number;
      }
    > = {};
    const mergeCounts = (
      acc: typeof orderCounts,
      c: { riderId: number | null; total: number; food: number; parcel: number; personRide: number }
    ) => {
      if (c.riderId != null) {
        const cur = acc[c.riderId] ?? { total: 0, food: 0, parcel: 0, person_ride: 0 };
        acc[c.riderId] = {
          total: cur.total + (c.total ?? 0),
          food: cur.food + (c.food ?? 0),
          parcel: cur.parcel + (c.parcel ?? 0),
          person_ride: cur.person_ride + (c.personRide ?? 0),
        };
      }
    };
    if (referredIds.length > 0) {
      // Count delivered orders from orders_core (primary) and orders (legacy) so all referred riders' orders are included
      try {
        const coreCounts = await db
          .select({
            riderId: ordersCore.riderId,
            total: sql<number>`count(*)::int`,
            food: sql<number>`count(*) filter (where ${ordersCore.orderType} = 'food')::int`,
            parcel: sql<number>`count(*) filter (where ${ordersCore.orderType} = 'parcel')::int`,
            personRide: sql<number>`count(*) filter (where ${ordersCore.orderType} = 'person_ride')::int`,
          })
          .from(ordersCore)
          .where(
            and(
              inArray(ordersCore.riderId, referredIds),
              eq(ordersCore.status, "delivered")
            )
          )
          .groupBy(ordersCore.riderId);
        coreCounts.forEach((c) => mergeCounts(orderCounts, c));
      } catch {
        // orders_core may not exist in some envs
      }
      const legacyCounts = await db
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
      legacyCounts.forEach((c) => mergeCounts(orderCounts, c));
    }

    // Calculate total referred count from both sources (without filters)
    // Get all referred IDs from referrals table
    const allReferredFromReferrals = await db
      .select({ referredId: referrals.referredId })
      .from(referrals)
      .where(eq(referrals.referrerId, riderId));

    // Get all referred IDs from riders table
    const allReferredFromRiders = await db
      .select({ id: riders.id })
      .from(riders)
      .where(eq(riders.referredBy, riderId));

    // Combine and deduplicate to get the actual total count
    const allReferredIds = new Set<number>();
    allReferredFromReferrals.forEach((r) => {
      if (r.referredId != null) allReferredIds.add(r.referredId);
    });
    allReferredFromRiders.forEach((r) => {
      if (r.id != null) allReferredIds.add(r.id);
    });

    const totalReferredCount = allReferredIds.size;

    const totalCredited = await db
      .select({
        sum: sql<string>`coalesce(sum(${referralFulfillments.amountCredited}), 0)`,
      })
      .from(referralFulfillments)
      .where(eq(referralFulfillments.referrerRiderId, riderId));

    const items = combinedReferralsList.slice(0, limit).map((r) => {
      const referredId = r.referredId ?? 0;
      const currentOrders = orderCounts[referredId] ?? {
        total: 0,
        food: 0,
        parcel: 0,
        person_ride: 0,
      };
      return {
        referralId: r.referralId,
        referredRiderId: referredId,
        referredRiderName: r.referredName ?? "Unknown",
        referredMobile: r.referredMobile ?? "—",
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

    const hasMore = combinedReferralsList.length > limit;

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
        totalReferredCount: totalReferredCount,
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
