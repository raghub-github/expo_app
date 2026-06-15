/**
 * GET /api/orders/core
 * List food (or parcel/ride) orders from orders_core with search and status filter.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import {
  listOrdersCore,
  getOrderManualStatusHistory,
  getFoodDeliveryInstructions,
  getFoodOrderStatus,
  getOrderTimelineEntriesWithFallback,
  recordEtaBreachIfNeeded,
  ensureOrderEtaWhenAccepted,
  type OrderSearchType,
  type OrderStatusFilter,
  type OrderTimelineEntry,
  type OrdersCoreRow,
} from "@/lib/db/operations/orders-core";
import { getOrderDetailEnrichment } from "@/lib/db/operations/order-detail-enrichment";
import { getPersonRideOrderDetail } from "@/lib/db/operations/person-ride-order-detail";
import {
  getRiderAssignmentTimeline,
  getOrderRiderActivityLogPayload,
  type RiderAssignmentTimelineData,
  type RiderActivityLogPayload,
} from "@/lib/db/operations/order-rider-assignments";
import {
  getOrderRiderTracking,
  type OrderRiderTrackingPayload,
} from "@/lib/db/operations/order-rider-tracking";
import { fetchOrderPaymentDetail } from "@/lib/orders/order-payment-detail";

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
import { listOrderRemarks } from "@/lib/db/operations/order-remarks";
import { listOrderRiderReconsWithRoles } from "@/lib/db/operations/order-recons";
import { listOrderCxNotifications } from "@/lib/db/operations/order-cx-notifications";
import {
  serializeNotificationForApi,
  serializeReconForApi,
  serializeRemarkForApi,
} from "@/lib/orders/order-sidebar-activity";
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
  remarksCount?: number;
  reconsCount?: number;
  notificationsCount?: number;
  remarks?: ReturnType<typeof serializeRemarkForApi>[];
  recons?: ReturnType<typeof serializeReconForApi>[];
  notifications?: ReturnType<typeof serializeNotificationForApi>[];
  statusHistory?: Awaited<ReturnType<typeof getOrderManualStatusHistory>>;
  paymentDetail: Awaited<ReturnType<typeof fetchOrderPaymentDetail>> | null;
  timeline: ReturnType<typeof serializeTimelineEntries>;
  riderTimeline: RiderAssignmentTimelineData | null;
  riderTracking: OrderRiderTrackingPayload | null;
  riderActivityLog: RiderActivityLogPayload | null;
};

/** Detail-page enrichments (timeline, payment, merchant summary) for a single-order fetch. */
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
  let remarksCount: number | undefined;
  let reconsCount: number | undefined;
  let notificationsCount: number | undefined;
  let remarksList: ReturnType<typeof serializeRemarkForApi>[] | undefined;
  let reconsList: ReturnType<typeof serializeReconForApi>[] | undefined;
  let notificationsList: ReturnType<typeof serializeNotificationForApi>[] | undefined;
  let statusHistory: Awaited<ReturnType<typeof getOrderManualStatusHistory>> | undefined;
  let paymentDetail: Awaited<ReturnType<typeof fetchOrderPaymentDetail>> | null = null;
  let timeline: ReturnType<typeof serializeTimelineEntries> = [];
  let riderTimeline: RiderAssignmentTimelineData | null = null;
  let riderTracking: OrderRiderTrackingPayload | null = null;
  let riderActivityLog: RiderActivityLogPayload | null = null;

  if (orderId != null && Number.isFinite(orderId)) {
    const firstRow = first as {
      orderId?: string | null;
      formattedOrderId?: string | null;
      merchantStoreId?: number | null;
      orderType?: string;
      orderSource?: string | null;
      paymentStatus?: string | null;
      paymentMethod?: string | null;
      grandTotal?: string | number | null;
      itemTotal?: string | number | null;
      addonTotal?: string | number | null;
      tipAmount?: string | number | null;
      riderId?: number | null;
    };

    void ensureOrderEtaWhenAccepted(orderId).catch((err) => {
      console.error("[GET /api/orders/core] ensureOrderEtaWhenAccepted failed", err);
    });
    void recordEtaBreachIfNeeded(orderId).catch((err) => {
      console.error("[GET /api/orders/core] recordEtaBreachIfNeeded failed", err);
    });

    const storeIdNum = storeId != null && Number.isFinite(storeId) ? storeId : null;
    const riderIdForTimeline =
      firstRow.riderId != null && Number.isFinite(Number(firstRow.riderId))
        ? Number(firstRow.riderId)
        : null;

    const [
      summary,
      remarksRows,
      reconsRows,
      notificationsRows,
      history,
      deliveryInstructions,
      detailExtra,
      paymentDetailResult,
      timelineEntries,
      riderTimelineResult,
      riderTrackingResult,
      riderActivityLogResult,
      foodOrderStatusResult,
    ] = await Promise.all([
      storeIdNum != null ? getMerchantStoreSummaryByStoreId(storeIdNum) : Promise.resolve(null),
      listOrderRemarks(orderId),
      listOrderRiderReconsWithRoles(orderId),
      listOrderCxNotifications(orderId),
      getOrderManualStatusHistory(orderId),
      first?.orderType === "food"
        ? getFoodDeliveryInstructions(orderId)
        : Promise.resolve(null),
      getOrderDetailEnrichment(orderId).catch((err) => {
        console.error("[GET /api/orders/core] order detail enrichment failed", err);
        return null;
      }),
      fetchOrderPaymentDetail({
        orderCoreId: orderId,
        orderIdText: firstRow.orderId != null ? String(firstRow.orderId) : null,
        formattedOrderId:
          firstRow.formattedOrderId != null ? String(firstRow.formattedOrderId) : null,
        displayId:
          firstRow.formattedOrderId?.trim() ||
          (firstRow.orderId ? String(firstRow.orderId) : `ORDER-${orderId}`),
        merchantStoreId: firstRow.merchantStoreId ?? null,
        orderType: firstRow.orderType ?? "food",
        orderSource: firstRow.orderSource ?? null,
        paymentStatus: firstRow.paymentStatus ?? null,
        paymentMethod: firstRow.paymentMethod ?? null,
        grandTotal: firstRow.grandTotal != null ? Number(firstRow.grandTotal) : null,
        itemTotal: firstRow.itemTotal != null ? Number(firstRow.itemTotal) : null,
        addonTotal: firstRow.addonTotal != null ? Number(firstRow.addonTotal) : null,
        tipAmount: firstRow.tipAmount != null ? Number(firstRow.tipAmount) : null,
      }).catch((err) => {
        console.error("[GET /api/orders/core] payment detail failed", err);
        return null;
      }),
      getOrderTimelineEntriesWithFallback(orderId).catch((err) => {
        console.error("[GET /api/orders/core] timeline fetch failed", err);
        return [] as OrderTimelineEntry[];
      }),
      riderIdForTimeline != null
        ? getRiderAssignmentTimeline(orderId, riderIdForTimeline).catch((err) => {
            console.error("[GET /api/orders/core] rider timeline fetch failed", err);
            return null;
          })
        : Promise.resolve(null),
      getOrderRiderTracking(orderId).catch((err) => {
        console.error("[GET /api/orders/core] rider tracking fetch failed", err);
        return null;
      }),
      getOrderRiderActivityLogPayload(orderId).catch((err) => {
        console.error("[GET /api/orders/core] rider activity log fetch failed", err);
        return null;
      }),
      first?.orderType === "food"
        ? getFoodOrderStatus(orderId).catch((err) => {
            console.error("[GET /api/orders/core] food order status failed", err);
            return null;
          })
        : Promise.resolve(null),
    ]);

    merchantSummary = summary;
    remarksList = remarksRows.map(serializeRemarkForApi);
    reconsList = reconsRows.map((r) =>
      serializeReconForApi({
        id: r.id,
        providerName: r.providerName,
        riderName: r.riderName,
        riderMobile: r.riderMobile,
        reconReason: r.reconReason,
        reconReasonCategory: r.reconReasonCategory,
        reconAt: r.reconAt,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
      })
    );
    notificationsList = notificationsRows.map(serializeNotificationForApi);
    remarksCount = remarksList.length;
    reconsCount = reconsList.length;
    notificationsCount = notificationsList.length;
    statusHistory = history;
    paymentDetail = paymentDetailResult;
    timeline = serializeTimelineEntries(timelineEntries);
    riderTimeline = riderTimelineResult;
    riderTracking = riderTrackingResult;
    riderActivityLog = riderActivityLogResult;

    let enrichedData = data;
    if (deliveryInstructions !== undefined) {
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          deliveryInstructions: deliveryInstructions ?? null,
        },
      ] as unknown as typeof enrichedData;
    }
    if (foodOrderStatusResult != null || first?.orderType === "food") {
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          foodOrderStatus: foodOrderStatusResult,
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
    if (paymentDetail != null) {
      enrichedData = [
        {
          ...(enrichedData[0] as Record<string, unknown>),
          paymentDetail,
        },
      ] as unknown as typeof enrichedData;
    }
    if (first?.orderType === "person_ride" && orderId != null) {
      const rideDetail = await getPersonRideOrderDetail(orderId);
      if (rideDetail) {
        enrichedData = [
          {
            ...(enrichedData[0] as Record<string, unknown>),
            rideDetail,
            pickupOtp: rideDetail.pickupOtp ?? (enrichedData[0] as { pickupOtp?: string | null }).pickupOtp,
          },
        ] as unknown as typeof enrichedData;
      }
    }
    data = enrichedData;
  } else if (storeId != null && Number.isFinite(storeId)) {
    merchantSummary = await getMerchantStoreSummaryByStoreId(storeId);
  }

  return {
    data,
    merchantSummary,
    remarksCount,
    reconsCount,
    notificationsCount,
    remarks: remarksList,
    recons: reconsList,
    notifications: notificationsList,
    statusHistory,
    paymentDetail,
    timeline,
    riderTimeline,
    riderTracking,
    riderActivityLog,
  };
}

function buildSingleOrderResponseExtras(
  enrichment: SingleOrderEnrichment | null
): Record<string, unknown> {
  if (enrichment == null) return {};
  return {
    ...(enrichment.merchantSummary != null && { merchantSummary: enrichment.merchantSummary }),
    ...(enrichment.remarksCount !== undefined && { remarksCount: enrichment.remarksCount }),
    ...(enrichment.reconsCount !== undefined && { reconsCount: enrichment.reconsCount }),
    ...(enrichment.notificationsCount !== undefined && {
      notificationsCount: enrichment.notificationsCount,
    }),
    ...(enrichment.remarks !== undefined && { remarks: enrichment.remarks }),
    ...(enrichment.recons !== undefined && { recons: enrichment.recons }),
    ...(enrichment.notifications !== undefined && { notifications: enrichment.notifications }),
    ...(enrichment.statusHistory !== undefined && { statusHistory: enrichment.statusHistory }),
    ...(enrichment.paymentDetail != null && { paymentDetail: enrichment.paymentDetail }),
    timeline: enrichment.timeline,
    riderTimeline: enrichment.riderTimeline,
    riderTracking: enrichment.riderTracking,
    riderActivityLog: enrichment.riderActivityLog,
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
