/**
 * GET /api/orders/core
 * List food (or parcel/ride) orders from orders_core with search and status filter.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  listOrdersCore,
  getFoodDeliveryInstructions,
  getFoodOrderMeta,
  getOrderTimelineEntriesWithFallback,
  recordEtaBreachIfNeeded,
  ensureOrderEtaWhenAccepted,
  type OrderSearchType,
  type OrderStatusFilter,
  type OrderTimelineEntry,
  type OrdersCoreRow,
} from "@/lib/db/operations/orders-core";
import { getOrderDetailEnrichment } from "@/lib/db/operations/order-detail-enrichment";
import { getPersonRideOrderDetail, getPersonRideBillingContext } from "@/lib/db/operations/person-ride-order-detail";
import {
  getOrderRiderAssignmentSnapshot,
  type OrderRiderAssignmentSnapshot,
} from "@/lib/db/operations/order-rider-dispatch-ui";
import { listOrderRoutedToHistory } from "@/lib/orders/stamp-order-routed-to";

/** Row returned to the client: list shape + `storeId`, optional enrichments for single-order fetch */
type OrderCoreApiListItem = Omit<OrdersCoreRow, "estimatedDeliveryTime"> & {
  storeId: string | null;
  merchantLocality?: string | null;
  deliveryInstructions?: string | null;
  estimatedDeliveryTime?: Date | string | null;
};
import {
  getMerchantStoreSummaryByStoreId,
  getMerchantLocalitiesByInternalIds,
  getStoreIdsByInternalIds,
  resolveMerchantLocalityLabel,
} from "@/lib/db/operations/merchant-stores";

function resolveOrderMerchantLocality(
  order: OrdersCoreRow,
  storeLocality: string | null | undefined
): string | null {
  if (storeLocality?.trim()) return storeLocality.trim();
  const pickup =
    order.pickupAddressNormalized?.trim() || order.pickupAddressRaw?.trim() || null;
  if (!pickup) return null;
  return resolveMerchantLocalityLabel({
    landmark: null,
    city: null,
    full_address: pickup,
  });
}

async function enrichOrdersListWithStoreMeta(
  orders: OrdersCoreRow[]
): Promise<OrderCoreApiListItem[]> {
  const internalIds = orders
    .map((o) => o.merchantStoreId)
    .filter((id): id is number => id != null && Number.isFinite(id));
  const [storeIds, localities] = await Promise.all([
    getStoreIdsByInternalIds(internalIds),
    getMerchantLocalitiesByInternalIds(internalIds),
  ]);
  return orders.map((order) => {
    const sid = order.merchantStoreId;
    const storeLocality = sid != null ? localities.get(sid) ?? null : null;
    return {
      ...order,
      storeId: sid != null ? storeIds.get(sid) ?? null : null,
      merchantLocality: resolveOrderMerchantLocality(order, storeLocality),
    };
  });
}
import { getRedisClient } from "@/lib/redis";
import { getCached, setCached } from "@/lib/server-cache";

function serializeTimelineEntries(entries: OrderTimelineEntry[]) {
  return entries.map((e) => ({
    ...e,
    occurredAt:
      e.occurredAt instanceof Date
        ? e.occurredAt.toISOString()
        : e.occurredAt != null
          ? String(e.occurredAt)
          : "",
    expectedByAt:
      e.expectedByAt instanceof Date
        ? e.expectedByAt.toISOString()
        : e.expectedByAt != null
          ? String(e.expectedByAt)
          : null,
  }));
}

type SingleOrderEnrichment = {
  data: OrderCoreApiListItem[];
  merchantSummary: Awaited<ReturnType<typeof getMerchantStoreSummaryByStoreId>> | null;
  timeline: ReturnType<typeof serializeTimelineEntries>;
  riderDispatchUi: OrderRiderAssignmentSnapshot | null;
  routedToHistory: Awaited<ReturnType<typeof listOrderRoutedToHistory>>;
};

/** Detail-page enrichments for first paint (timeline + merchant + dispatch). */
async function enrichSingleOrderDetail(
  data: OrderCoreApiListItem[]
): Promise<SingleOrderEnrichment | null> {
  if (data.length !== 1) return null;

  const first = data[0] as {
    id?: number;
    merchantStoreId?: number | null;
    orderType?: string;
  };
  const orderId = first?.id;
  const storeId = first?.merchantStoreId;

  let merchantSummary: Awaited<ReturnType<typeof getMerchantStoreSummaryByStoreId>> = null;
  let timeline: ReturnType<typeof serializeTimelineEntries> = [];
  let riderDispatchUi: OrderRiderAssignmentSnapshot | null = null;
  let routedToHistory: Awaited<ReturnType<typeof listOrderRoutedToHistory>> = [];

  if (orderId != null && Number.isFinite(orderId)) {
    const firstRow = first as {
      riderId?: number | null;
    };

    void ensureOrderEtaWhenAccepted(orderId).catch((err) => {
      console.error("[GET /api/orders/core] ensureOrderEtaWhenAccepted failed", err);
    });
    void recordEtaBreachIfNeeded(orderId).catch((err) => {
      console.error("[GET /api/orders/core] recordEtaBreachIfNeeded failed", err);
    });

    const storeIdNum = storeId != null && Number.isFinite(storeId) ? storeId : null;

    // First-paint enrichments only. Payment, sidebar, rider map/chat load client-side.
    const [
      summary,
      deliveryInstructions,
      detailExtra,
      timelineEntries,
      foodOrderMetaResult,
      riderDispatchUiResult,
      routedToHistoryResult,
    ] = await Promise.all([
      storeIdNum != null ? getMerchantStoreSummaryByStoreId(storeIdNum) : Promise.resolve(null),
      first?.orderType === "food"
        ? getFoodDeliveryInstructions(orderId)
        : Promise.resolve(null),
      getOrderDetailEnrichment(orderId).catch((err) => {
        console.error("[GET /api/orders/core] order detail enrichment failed", err);
        return null;
      }),
      getOrderTimelineEntriesWithFallback(orderId, {
        includeRiderMilestones: first?.orderType === "person_ride",
      }).catch((err) => {
        console.error("[GET /api/orders/core] timeline fetch failed", err);
        return [] as OrderTimelineEntry[];
      }),
      first?.orderType === "food"
        ? getFoodOrderMeta(orderId).catch((err) => {
            console.error("[GET /api/orders/core] food order meta failed", err);
            return null;
          })
        : Promise.resolve(null),
      getOrderRiderAssignmentSnapshot(orderId).catch((err) => {
        console.error("[GET /api/orders/core] rider dispatch ui fetch failed", err);
        return null;
      }),
      listOrderRoutedToHistory(orderId).catch((err) => {
        console.error("[GET /api/orders/core] routed-to history fetch failed", err);
        return [] as Awaited<ReturnType<typeof listOrderRoutedToHistory>>;
      }),
    ]);

    merchantSummary = summary;
    timeline = serializeTimelineEntries(timelineEntries);
    riderDispatchUi = riderDispatchUiResult;
    routedToHistory = routedToHistoryResult;

    let enrichedData = data;
    if (deliveryInstructions !== undefined) {
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          deliveryInstructions: deliveryInstructions ?? null,
        },
      ] as unknown as typeof enrichedData;
    }
    if (foodOrderMetaResult != null || first?.orderType === "food") {
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          foodOrderStatus: foodOrderMetaResult?.orderStatus ?? null,
          dispatchedAt: foodOrderMetaResult?.dispatchedAt ?? null,
          riderPickedUpAt: foodOrderMetaResult?.riderPickedUpAt ?? null,
        },
      ] as unknown as typeof enrichedData;
    }
    if (detailExtra != null) {
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          orderTimeIso: detailExtra.orderTimeIso,
          orderTimeSource: detailExtra.orderTimeSource,
          itemCount: detailExtra.itemCount,
          systemKptMinutes: detailExtra.systemKptMinutes,
          merchantUpdatedKptMinutes: detailExtra.merchantUpdatedKptMinutes,
          merchantExtraPrepMinutes: detailExtra.merchantExtraPrepMinutes,
          isScheduledOrder: detailExtra.isScheduledOrder,
          scheduledDeliverySummary: detailExtra.scheduledDeliverySummary,
          deliveryType: detailExtra.deliveryType,
          contactlessDelivery: detailExtra.contactlessDelivery,
          localityType: detailExtra.localityType,
          localityIsSafe: detailExtra.localityIsSafe,
          deliveredBy: detailExtra.deliveredBy,
          deliveryInitiator: detailExtra.deliveryInitiator,
          customerTrustTierLabel: detailExtra.customerTrustTierLabel,
          customerUserType: detailExtra.customerUserType,
          riderId: detailExtra.riderId ?? firstRow.riderId ?? null,
          riderInstructionsList: detailExtra.riderInstructionsList,
          merchantInstructionsList: detailExtra.merchantInstructionsList,
          firstEtaAt:
            detailExtra.firstEtaAtIso ??
            (enrichedData[0] as { firstEtaAt?: string | Date | null }).firstEtaAt ??
            (enrichedData[0] as { estimatedDeliveryTime?: string | Date | null })
              .estimatedDeliveryTime ??
            null,
          cancellationInfo: detailExtra.cancellationInfo,
          pickupOtp: detailExtra.pickupOtp,
          rtoOtp: detailExtra.rtoOtp,
          deliveryOtp: detailExtra.deliveryOtp,
          customerFeedback: detailExtra.customerFeedback,
          storePrepDelaySeconds: detailExtra.storePrepDelaySeconds,
          storePrepDelayLive: detailExtra.storePrepDelayLive,
          storePrepDelayAnchorAt: detailExtra.storePrepDelayAnchorAt,
          storePrepDelayWasLate: detailExtra.storePrepDelayWasLate,
          riderRestaurantWaitSeconds: detailExtra.riderRestaurantWaitSeconds,
          riderRestaurantWaitLive: detailExtra.riderRestaurantWaitLive,
          riderRestaurantWaitAnchorAt: detailExtra.riderRestaurantWaitAnchorAt,
          deliveryProofImageUrl: detailExtra.deliveryProofImageUrl,
        },
      ] as unknown as typeof enrichedData;
    }
    if (first?.orderType === "person_ride" && orderId != null) {
      const [rideDetail, billingCtx] = await Promise.all([
        getPersonRideOrderDetail(orderId),
        getPersonRideBillingContext(orderId),
      ]);
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          ...(rideDetail
            ? {
                rideDetail,
                pickupOtp:
                  rideDetail.pickupOtp ??
                  (enrichedData[0] as { pickupOtp?: string | null }).pickupOtp,
              }
            : {}),
          billingSnapshot: billingCtx.billingSnapshot,
          // Prefer live DB payment fields over list-cache stale values
          paymentStatus:
            billingCtx.paymentStatus ??
            (enrichedData[0] as { paymentStatus?: string | null }).paymentStatus ??
            null,
          paymentMethod:
            billingCtx.paymentMethod ??
            (enrichedData[0] as { paymentMethod?: string | null }).paymentMethod ??
            null,
          fareAmount:
            billingCtx.fareAmount ??
            (enrichedData[0] as { fareAmount?: number | null }).fareAmount ??
            null,
          itemTotal:
            billingCtx.itemTotal ??
            (enrichedData[0] as { itemTotal?: number | null }).itemTotal ??
            null,
          grandTotal:
            billingCtx.grandTotal ??
            (enrichedData[0] as { grandTotal?: number | null }).grandTotal ??
            null,
          tipAmount:
            billingCtx.tipAmount ??
            (enrichedData[0] as { tipAmount?: number | null }).tipAmount ??
            null,
        },
      ] as unknown as typeof enrichedData;
    }
    data = enrichedData;
  } else if (storeId != null && Number.isFinite(storeId)) {
    merchantSummary = await getMerchantStoreSummaryByStoreId(storeId);
  }

  return {
    data,
    merchantSummary,
    timeline,
    riderDispatchUi,
    routedToHistory,
  };
}

function buildSingleOrderResponseExtras(
  enrichment: SingleOrderEnrichment | null
): Record<string, unknown> {
  if (enrichment == null) return {};
  return {
    ...(enrichment.merchantSummary != null && { merchantSummary: enrichment.merchantSummary }),
    timeline: enrichment.timeline,
    riderDispatchUi: enrichment.riderDispatchUi,
    routedToHistory: enrichment.routedToHistory,
  };
}

export const runtime = "nodejs";

const VALID_SEARCH_TYPES: OrderSearchType[] = [
  "Order Id",
  "Merchant Id",
  "Customer Mobile",
  "Third Party Order Id",
  "ONDC Order Id",
  "Client Reference Id",
  "Partner Order Id",
  "Internal Order Id",
  "Rider Mobile",
  "Tracking Order Id",
  "Client Name",
];

const VALID_STATUS_FILTERS: OrderStatusFilter[] = [
  "PAYMENT DONE",
  "ACCEPTED",
  "DESPATCH READY",
  "DESPATCHED",
  "BULK",
];

export async function GET(request: NextRequest) {
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

    const [userIsSuperAdmin, hasOrderAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email ?? ""),
      hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"),
    ]);

    const allowed = userIsSuperAdmin || hasOrderAccess;

    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Access to Orders dashboard required.",
        },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim() || undefined;
    const searchTypeParam = searchParams.get("searchType");
    const searchType: OrderSearchType = VALID_SEARCH_TYPES.includes(
      searchTypeParam as OrderSearchType
    )
      ? (searchTypeParam as OrderSearchType)
      : "Order Id";

    const statusFilterParam = searchParams.get("statusFilter");
    const statusFilter: OrderStatusFilter | null =
      statusFilterParam && VALID_STATUS_FILTERS.includes(statusFilterParam as OrderStatusFilter)
        ? (statusFilterParam as OrderStatusFilter)
        : null;

    const orderType = (searchParams.get("orderType") as "food" | "parcel" | "person_ride") || "food";
    const idParam = searchParams.get("id");
    const id = idParam ? parseInt(idParam, 10) : undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10))
    );

    let userTypeLabels: string[] = [];
    let deliveryFilters: ("GatiMitra" | "Merchant")[] = [];
    let foodPanelFilters:
      | {
          pickUp?: boolean;
          food?: boolean;
          fashion?: boolean;
          grocery?: boolean;
          pharma?: boolean;
          overview?: boolean;
        }
      | undefined;
    const rawFoodFilters = searchParams.get("foodFilters");
    if (rawFoodFilters) {
      try {
        const parsed = JSON.parse(decodeURIComponent(rawFoodFilters)) as {
          userType?: unknown;
          delivery?: unknown;
          pickUp?: unknown;
          food?: unknown;
          fashion?: unknown;
          grocery?: unknown;
          pharma?: unknown;
          overview?: unknown;
        };
        if (Array.isArray(parsed.userType)) {
          userTypeLabels = parsed.userType.filter((x): x is string => typeof x === "string");
        }
        if (Array.isArray(parsed.delivery)) {
          deliveryFilters = parsed.delivery.filter(
            (x): x is "GatiMitra" | "Merchant" => x === "GatiMitra" || x === "Merchant"
          );
        }
        const hasPanel =
          Boolean(parsed.pickUp) ||
          Boolean(parsed.food) ||
          Boolean(parsed.fashion) ||
          Boolean(parsed.grocery) ||
          Boolean(parsed.pharma) ||
          Boolean(parsed.overview);
        if (hasPanel) {
          foodPanelFilters = {
            pickUp: Boolean(parsed.pickUp),
            food: Boolean(parsed.food),
            fashion: Boolean(parsed.fashion),
            grocery: Boolean(parsed.grocery),
            pharma: Boolean(parsed.pharma),
            overview: Boolean(parsed.overview),
          };
        }
      } catch {
        /* ignore malformed */
      }
    }

    const listParams = {
      page,
      limit,
      id: id != null && Number.isFinite(id) ? id : undefined,
      search,
      searchType,
      statusFilter,
      orderType,
      sortBy: "created_at" as const,
      sortOrder: "desc" as const,
      userTypeLabels: userTypeLabels.length ? userTypeLabels : undefined,
      deliveryFilters: deliveryFilters.length ? deliveryFilters : undefined,
      foodPanelFilters,
    };

    const skipCache = searchParams.get("skipCache") === "1";

    const redis = getRedisClient();
    const cacheKey = user?.id ? `orders_core:${user.id}:${JSON.stringify(listParams)}` : null;
    const MEMORY_TTL_MS = 10_000; // 10s in-memory fallback

    if (cacheKey && !skipCache) {
      const cached = getCached<Awaited<ReturnType<typeof listOrdersCore>>>(cacheKey);
      if (cached) {
        let data = await enrichOrdersListWithStoreMeta(cached.orders);
        const enrichment = await enrichSingleOrderDetail(data);
        if (enrichment != null) {
          data = enrichment.data;
        }

        return NextResponse.json({
          success: true,
          data,
          pagination: {
            page: cached.page,
            limit: cached.limit,
            total: cached.total,
          },
          ...buildSingleOrderResponseExtras(enrichment),
        });
      }
    }

    if (redis && cacheKey && !skipCache) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Awaited<ReturnType<typeof listOrdersCore>>;
          // Populate memory cache too for immediate follow-up navigations.
          setCached(cacheKey, parsed, MEMORY_TTL_MS);

          const data = await enrichOrdersListWithStoreMeta(parsed.orders);
          let enrichedData = data;
          const enrichment = await enrichSingleOrderDetail(enrichedData);
          if (enrichment != null) {
            enrichedData = enrichment.data;
          }

          return NextResponse.json({
            success: true,
            data: enrichedData,
            pagination: {
              page: parsed.page,
              limit: parsed.limit,
              total: parsed.total,
            },
            ...buildSingleOrderResponseExtras(enrichment),
          });
        }
      } catch {
        // ignore cache read errors
      }
    }

    const result = await listOrdersCore(listParams);

    let data: OrderCoreApiListItem[] = await enrichOrdersListWithStoreMeta(result.orders);

    const enrichment = await enrichSingleOrderDetail(data);
    if (enrichment != null) {
      data = enrichment.data;
    }

    if (cacheKey) {
      setCached(cacheKey, result, MEMORY_TTL_MS);
    }

    if (redis && cacheKey) {
      try {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 30);
      } catch {
        // ignore cache write errors
      }
    }

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
      ...buildSingleOrderResponseExtras(enrichment),
    });
  } catch (error) {
    console.error("[GET /api/orders/core] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
