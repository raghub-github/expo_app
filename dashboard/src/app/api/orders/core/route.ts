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
  recordEtaBreachIfNeeded,
  ensureOrderEtaWhenAccepted,
  getOrderTimelineEntriesWithFallback,
  type OrderSearchType,
  type OrderStatusFilter,
  type OrdersCoreRow,
} from "@/lib/db/operations/orders-core";
import { getOrderDetailEnrichment } from "@/lib/db/operations/order-detail-enrichment";
import { fetchOrderPaymentDetail } from "@/lib/orders/order-payment-detail";

/** Row returned to the client: list shape + `storeId`, optional enrichments for single-order fetch */
type OrderCoreApiListItem = Omit<OrdersCoreRow, "estimatedDeliveryTime"> & {
  storeId: string | null;
  deliveryInstructions?: string | null;
  estimatedDeliveryTime?: Date | string | null;
};
import {
  getMerchantStoreSummaryByStoreId,
  getStoreIdsByInternalIds,
} from "@/lib/db/operations/merchant-stores";
import { getOrderRemarksCount } from "@/lib/db/operations/order-remarks";
import { getOrderReconsCount } from "@/lib/db/operations/order-recons";
import { getRedisClient } from "@/lib/redis";
import { getCached, setCached } from "@/lib/server-cache";

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
        const storeIds = await getStoreIdsByInternalIds(
          cached.orders
            .map((o) => (o as { merchantStoreId?: number | null }).merchantStoreId)
            .filter((id): id is number => id != null && Number.isFinite(id))
        );

        const data = cached.orders.map((order) => {
          const o = order as { merchantStoreId?: number | null };
          const storeIdDisplay = o.merchantStoreId != null ? storeIds.get(o.merchantStoreId) ?? null : null;
          return { ...order, storeId: storeIdDisplay };
        });

        return NextResponse.json({
          success: true,
          data,
          pagination: {
            page: cached.page,
            limit: cached.limit,
            total: cached.total,
          },
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

          const storeIds = await getStoreIdsByInternalIds(
            parsed.orders
              .map((o) => (o as { merchantStoreId?: number | null }).merchantStoreId)
              .filter((id): id is number => id != null && Number.isFinite(id))
          );
          const data = parsed.orders.map((order) => {
            const o = order as { merchantStoreId?: number | null };
            const storeIdDisplay =
              o.merchantStoreId != null ? storeIds.get(o.merchantStoreId) ?? null : null;
            return { ...order, storeId: storeIdDisplay };
          });

          return NextResponse.json({
            success: true,
            data,
            pagination: {
              page: parsed.page,
              limit: parsed.limit,
              total: parsed.total,
            },
          });
        }
      } catch {
        // ignore cache read errors
      }
    }

    const result = await listOrdersCore(listParams);

    const storeIds = await getStoreIdsByInternalIds(
      result.orders
        .map((o) => (o as { merchantStoreId?: number | null }).merchantStoreId)
        .filter((id): id is number => id != null && Number.isFinite(id))
    );
    let data: OrderCoreApiListItem[] = result.orders.map((order) => {
      const o = order as { merchantStoreId?: number | null };
      const storeIdDisplay =
        o.merchantStoreId != null ? storeIds.get(o.merchantStoreId) ?? null : null;
      return { ...order, storeId: storeIdDisplay };
    });

    let merchantSummary: Awaited<ReturnType<typeof getMerchantStoreSummaryByStoreId>> = null;
    let remarksCount: number | undefined;
    let reconsCount: number | undefined;
    let statusHistory: Awaited<ReturnType<typeof getOrderManualStatusHistory>> | undefined;
    let timeline: Awaited<ReturnType<typeof getOrderTimelineEntriesWithFallback>> | undefined;
    let paymentDetail: Awaited<ReturnType<typeof fetchOrderPaymentDetail>> | null = null;
    if (result.orders.length === 1) {
      const first = data[0] as {
        id?: number;
        merchantStoreId?: number | null;
        orderType?: string;
      };
      const orderId = first?.id;
      const storeId = first?.merchantStoreId;
      if (storeId != null && Number.isFinite(storeId)) {
        merchantSummary = await getMerchantStoreSummaryByStoreId(storeId);
      }
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
        };

        const [remarks, recons, history, deliveryInstructions, etaSet, etaBreach, timelineEntries, detailExtra, paymentDetail] =
          await Promise.all([
            getOrderRemarksCount(orderId),
            getOrderReconsCount(orderId),
            getOrderManualStatusHistory(orderId),
            first?.orderType === "food"
              ? getFoodDeliveryInstructions(orderId)
              : Promise.resolve(null),
            ensureOrderEtaWhenAccepted(orderId),
            recordEtaBreachIfNeeded(orderId),
            getOrderTimelineEntriesWithFallback(orderId),
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
              grandTotal:
                firstRow.grandTotal != null ? Number(firstRow.grandTotal) : null,
              itemTotal: firstRow.itemTotal != null ? Number(firstRow.itemTotal) : null,
              addonTotal: firstRow.addonTotal != null ? Number(firstRow.addonTotal) : null,
              tipAmount: firstRow.tipAmount != null ? Number(firstRow.tipAmount) : null,
            }).catch((err) => {
              console.error("[GET /api/orders/core] payment detail failed", err);
              return null;
            }),
          ]);
        timeline = timelineEntries;
        remarksCount = remarks;
        reconsCount = recons;
        statusHistory = history;
        if (deliveryInstructions !== undefined) {
          data = [{ ...(data[0] as Record<string, unknown>), deliveryInstructions: deliveryInstructions ?? null }] as unknown as typeof data;
        }
        if (etaSet != null) {
          data = [{ ...(data[0] as Record<string, unknown>), estimatedDeliveryTime: etaSet.estimatedDeliveryTime.toISOString() }] as unknown as typeof data;
        }
        if (etaBreach != null) {
          data = [
            {
              ...(data[0] as Record<string, unknown>),
              etaBreachedAt: etaBreach.etaBreachedAt,
              etaBreachedTimelineId: etaBreach.etaBreachedTimelineId,
            },
          ] as unknown as typeof data;
        }
        if (detailExtra != null) {
          data = [
            {
              ...(data[0] as Record<string, unknown>),
              orderTimeIso: detailExtra.orderTimeIso,
              orderTimeSource: detailExtra.orderTimeSource,
              itemCount: detailExtra.itemCount,
              systemKptMinutes: detailExtra.systemKptMinutes,
              merchantUpdatedKptMinutes: detailExtra.merchantUpdatedKptMinutes,
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
              riderInstructionsList: detailExtra.riderInstructionsList,
              merchantInstructionsList: detailExtra.merchantInstructionsList,
              firstEtaAt:
                detailExtra.firstEtaAtIso ??
                (data[0] as { firstEtaAt?: string | Date | null }).firstEtaAt ??
                (data[0] as { estimatedDeliveryTime?: string | Date | null })
                  .estimatedDeliveryTime ??
                null,
            },
          ] as unknown as typeof data;
        }
        if (paymentDetail != null) {
          data = [
            {
              ...(data[0] as Record<string, unknown>),
              paymentDetail,
            },
          ] as unknown as typeof data;
        }
      }
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
      ...(merchantSummary != null && { merchantSummary }),
      ...(remarksCount !== undefined && { remarksCount }),
      ...(reconsCount !== undefined && { reconsCount }),
      ...(statusHistory !== undefined && { statusHistory }),
      ...(timeline !== undefined && { timeline }),
      ...(paymentDetail != null && { paymentDetail }),
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
