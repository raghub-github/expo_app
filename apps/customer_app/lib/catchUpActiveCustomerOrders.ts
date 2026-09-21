/**
 * Authoritative catch-up for Active tab / floating dock.
 *
 * The My Orders list endpoint is heavy. After kill / background, Zustand is empty
 * and list refetch can take many seconds — meanwhile cached ACCEPTED rows stay on
 * Active. Hitting GET /orders/:id for each live id (and applying any disk patch
 * from a background FCM) clears completed orders without waiting for the list.
 */

import type { QueryClient } from "@tanstack/react-query";
import { orderService, type OrderSummary } from "@/services/order.service";
import { applyServerCustomerOrderStatus } from "@/lib/apply-customer-order-status";
import { isActiveOrderStatus, isTerminalOrderStatus } from "@/lib/customer-order-status-display";
import {
  collectOrderAliases,
  isCustomerOrderTerminalStatus,
} from "@/lib/customer-order-status-machine";
import {
  readSyncMyOrders,
  reloadMyOrdersMemory,
} from "@/lib/myOrdersCache";
import { useOrderStore } from "@/store/orderStore";

function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: number; response?: { status?: number } };
  const n = e.status ?? e.response?.status;
  return typeof n === "number" ? n : undefined;
}

function liveIdsFromRow(row: {
  orderId?: string | null;
  formattedOrderId?: string | null;
  status?: string | null;
}): string[] {
  if (!isActiveOrderStatus(row.status)) return [];
  return collectOrderAliases(row.orderId, row.formattedOrderId);
}

let inFlight: Promise<void> | null = null;

export function catchUpActiveCustomerOrders(queryClient: QueryClient): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      await runCatchUp(queryClient);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function runCatchUp(queryClient: QueryClient): Promise<void> {
  reloadMyOrdersMemory();
  const cached = (readSyncMyOrders() ?? []) as OrderSummary[];
  const listed =
    queryClient.getQueryData<OrderSummary[]>(["my-orders"]) ?? cached;
  const stored = useOrderStore.getState().activeOrders;

  for (const row of [...cached, ...listed]) {
    if (!isTerminalOrderStatus(row.status)) continue;
    applyServerCustomerOrderStatus({
      queryClient,
      orderIds: [row.orderId, row.formattedOrderId],
      status: row.status,
      formattedOrderId: row.formattedOrderId ?? null,
    });
  }

  const idSet = new Set<string>();
  for (const row of cached) {
    for (const id of liveIdsFromRow(row)) idSet.add(id);
  }
  for (const row of listed) {
    for (const id of liveIdsFromRow(row)) idSet.add(id);
  }
  for (const o of stored) {
    if (!isActiveOrderStatus(o.status)) continue;
    for (const id of collectOrderAliases(o.orderId, o.formattedOrderId)) {
      idSet.add(id);
    }
  }

  const ids = Array.from(idSet).slice(0, 12);
  if (ids.length === 0) return;

  const seenUpper = new Set<string>();
  await Promise.all(
    ids.map(async (orderId) => {
      const upper = orderId.toUpperCase();
      if (seenUpper.has(upper)) return;
      seenUpper.add(upper);
      try {
        const detail = await orderService.getOrder(orderId);
        const status = detail?.status;
        if (!status) return;
        applyServerCustomerOrderStatus({
          queryClient,
          orderIds: [orderId, detail.orderId, detail.formattedOrderId],
          status,
          detail,
          formattedOrderId: detail.formattedOrderId ?? null,
        });
        for (const alias of collectOrderAliases(orderId, detail.orderId, detail.formattedOrderId)) {
          seenUpper.add(alias.toUpperCase());
        }
        if (isCustomerOrderTerminalStatus(status)) {
          useOrderStore.getState().removeActiveOrder(orderId);
          if (detail.formattedOrderId) {
            useOrderStore.getState().removeActiveOrder(detail.formattedOrderId);
          }
        }
      } catch (err) {
        if (httpStatusOf(err) === 404) {
          useOrderStore.getState().removeActiveOrder(orderId);
        }
      }
    })
  );
}
