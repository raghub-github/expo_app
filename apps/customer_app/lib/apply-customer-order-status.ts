/**
 * Apply a server-authoritative order status to every Customer App surface:
 * React Query order/detail + My Orders, disk cache, Zustand active-order dock.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { OrderDetail, OrderSummary } from "@/services/order.service";
import {
  collectOrderAliases,
  isCustomerOrderTerminalStatus,
  orderRefsMatch,
  selectAuthoritativeCustomerStatus,
} from "@/lib/customer-order-status-machine";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { useOrderStore, type ActiveOrderService, type OrderStatus } from "@/store/orderStore";
import { writeCachedMyOrders } from "@/lib/myOrdersCache";

export type ApplyServerOrderStatusInput = {
  queryClient: QueryClient;
  orderIds: Array<string | null | undefined>;
  status: string | null | undefined;
  detail?: Partial<OrderDetail> | null;
  etaMinutes?: number | null;
  formattedOrderId?: string | null;
  storeName?: string | null;
  serviceType?: ActiveOrderService;
};

export type ApplyServerOrderStatusResult = {
  applied: string;
  terminal: boolean;
  changed: boolean;
};

function patchOrderList(
  prev: OrderSummary[] | undefined,
  aliases: string[],
  status: string,
  extra?: { formattedOrderId?: string | null }
): OrderSummary[] | undefined {
  if (!Array.isArray(prev)) return prev;
  let changed = false;
  const next = prev.map((row) => {
    if (!aliases.some((id) => orderRefsMatch(row, id))) return row;
    const mergedStatus = selectAuthoritativeCustomerStatus(row.status, status);
    const formatted =
      extra?.formattedOrderId && extra.formattedOrderId.trim()
        ? extra.formattedOrderId
        : row.formattedOrderId;
    if (row.status === mergedStatus && formatted === row.formattedOrderId) return row;
    changed = true;
    return { ...row, status: mergedStatus, formattedOrderId: formatted ?? row.formattedOrderId };
  });
  return changed ? next : prev;
}

function persistMyOrders(queryClient: QueryClient) {
  const list = queryClient.getQueryData<OrderSummary[]>(["my-orders"]);
  if (Array.isArray(list)) {
    void writeCachedMyOrders(list);
  }
}

/**
 * Write a server status into caches/store. Never invents COMPLETED locally —
 * callers must pass a status that came from WS/HTTP/push metadata.
 */
export function applyServerCustomerOrderStatus(
  input: ApplyServerOrderStatusInput
): ApplyServerOrderStatusResult | null {
  const applied = normalizeCustomerOrderStatus(input.status);
  if (!applied) return null;

  const aliases = collectOrderAliases(
    ...input.orderIds,
    input.formattedOrderId,
    input.detail?.orderId,
    input.detail?.formattedOrderId
  );
  if (aliases.length === 0) return null;

  const queryClient = input.queryClient;
  let changed = false;
  const terminal = isCustomerOrderTerminalStatus(applied);

  for (const orderId of aliases) {
    queryClient.setQueryData<OrderDetail>(["order", orderId], (prev) => {
      if (!prev && !input.detail) return prev;
      const base: OrderDetail = {
        orderId,
        status: applied,
        createdAt: new Date().toISOString(),
        ...(prev ?? {}),
        ...(input.detail ?? {}),
      };
      const mergedStatus = selectAuthoritativeCustomerStatus(prev?.status, applied);
      if (
        prev &&
        prev.status === mergedStatus &&
        !input.detail
      ) {
        return prev;
      }
      if (prev?.status !== mergedStatus) changed = true;
      return { ...base, status: mergedStatus };
    });
  }

  queryClient.setQueriesData<OrderSummary[]>({ queryKey: ["my-orders"] }, (prev) => {
    const next = patchOrderList(prev, aliases, applied, {
      formattedOrderId: input.formattedOrderId ?? input.detail?.formattedOrderId,
    });
    if (next !== prev) changed = true;
    return next;
  });
  persistMyOrders(queryClient);

  const store = useOrderStore.getState();
  if (terminal) {
    for (const id of aliases) {
      store.removeActiveOrder(id);
    }
    for (const id of aliases) {
      queryClient.removeQueries({ queryKey: ["orderTracking", id] });
    }
  } else {
    store.updateOrderStatus(aliases[0]!, applied as OrderStatus, input.etaMinutes ?? undefined, {
      formattedOrderId: input.formattedOrderId ?? input.detail?.formattedOrderId ?? null,
      storeName: input.storeName ?? input.detail?.merchantPublicName ?? input.detail?.merchantName ?? null,
      serviceType: input.serviceType,
    });
  }

  return { applied, terminal, changed };
}
