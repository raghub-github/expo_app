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
  type OrderSearchType,
  type OrderStatusFilter,
  type OrdersCoreRow,
} from "@/lib/db/operations/orders-core";

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
    };

    const redis = getRedisClient();
    const cacheKey = user?.id ? `orders_core:${user.id}:${JSON.stringify(listParams)}` : null;
    const MEMORY_TTL_MS = 10_000; // 10s in-memory fallback

    if (cacheKey) {
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

    if (redis && cacheKey) {
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
        const [remarks, recons, history, deliveryInstructions, etaSet, etaBreach] = await Promise.all([
          getOrderRemarksCount(orderId),
          getOrderReconsCount(orderId),
          getOrderManualStatusHistory(orderId),
          first?.orderType === "food"
            ? getFoodDeliveryInstructions(orderId)
            : Promise.resolve(null),
          ensureOrderEtaWhenAccepted(orderId),
          recordEtaBreachIfNeeded(orderId),
        ]);
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
