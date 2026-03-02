/**
 * Orders hook — single source of truth for order list.
 * Supports multi-status flow + delivery types and exposes dynamic counts.
 * Replace fetchOrdersMock with real API / websocket-backed implementation.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export type DeliveryType = "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP";

export type OrderStage =
  | "created"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivered"
  | "rejected"
  | "rto";

export type LineItem = { qty: number; name: string; price: number };

export type OrderRecord = {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string; // ISO string
  displayTime: string; // e.g. "6:30 PM"
  lineItems: LineItem[];
  total: number;
  status: OrderStage;
  deliveryType: DeliveryType;
  pickupOtp?: string;
  rtoOtp?: string;
};

export type OrderCounts = {
  all: number;
} & Record<OrderStage, number>;

const MOCK_ORDERS: OrderRecord[] = [
  {
    id: "1",
    orderNumber: "0224",
    customerName: "Sameer",
    createdAt: new Date(Date.now() - 60 * 1000).toISOString(), // 1 min ago
    displayTime: "6:30 PM",
    lineItems: [
      { qty: 1, name: "Butter Chicken", price: 410 },
      { qty: 1, name: "Garlic Naan", price: 90 },
    ],
    total: 500,
    status: "preparing",
    deliveryType: "SELF_DELIVERY",
    pickupOtp: "4821",
  },
  {
    id: "2",
    orderNumber: "0223",
    customerName: "Rohan",
    createdAt: new Date(Date.now() - 2 * 60 * 1000 - 30 * 1000).toISOString(), // 2.5 min ago
    displayTime: "6:15 PM",
    lineItems: [
      { qty: 2, name: "Veg Biryani", price: 320 },
      { qty: 1, name: "Raita", price: 60 },
    ],
    total: 700,
    status: "preparing",
    deliveryType: "GATIMITRA_RIDER",
    pickupOtp: "7394",
  },
  {
    id: "3",
    orderNumber: "0222",
    customerName: "Priya",
    createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    displayTime: "6:00 PM",
    lineItems: [{ qty: 1, name: "Dal Makhani", price: 250 }],
    total: 250,
    status: "ready",
    deliveryType: "SELF_PICKUP",
    pickupOtp: "1122",
  },
  {
    id: "4",
    orderNumber: "0221",
    customerName: "Amit",
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    displayTime: "5:45 PM",
    lineItems: [
      { qty: 2, name: "Paneer Tikka", price: 280 },
      { qty: 1, name: "Naan", price: 50 },
    ],
    total: 610,
    status: "picked_up",
    deliveryType: "SELF_DELIVERY",
    pickupOtp: "5566",
  },
  {
    id: "5",
    orderNumber: "0220",
    customerName: "Vikram",
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    displayTime: "5:30 PM",
    lineItems: [{ qty: 1, name: "Thali", price: 320 }],
    total: 320,
    status: "delivered",
    deliveryType: "SELF_DELIVERY",
  },
  {
    id: "6",
    orderNumber: "0219",
    customerName: "Neha",
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    displayTime: "5:20 PM",
    lineItems: [{ qty: 1, name: "Pizza Margherita", price: 499 }],
    total: 499,
    status: "rejected",
    deliveryType: "SELF_DELIVERY",
  },
  {
    id: "7",
    orderNumber: "0218",
    customerName: "Rahul",
    createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    displayTime: "5:05 PM",
    lineItems: [{ qty: 1, name: "Burger Combo", price: 299 }],
    total: 299,
    status: "rto",
    deliveryType: "GATIMITRA_RIDER",
    rtoOtp: "9041",
  },
  {
    id: "8",
    orderNumber: "0217",
    customerName: "Guest",
    createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    displayTime: "6:20 PM",
    lineItems: [{ qty: 1, name: "Cold Coffee", price: 120 }],
    total: 120,
    status: "created",
    deliveryType: "SELF_PICKUP",
    pickupOtp: "7788",
  },
];

async function fetchOrdersMock(): Promise<OrderRecord[]> {
  // Simulate network delay + fresh copy to avoid accidental mutation.
  await new Promise((resolve) => setTimeout(resolve, 300));
  return JSON.parse(JSON.stringify(MOCK_ORDERS)) as OrderRecord[];
}

function canTransition(order: OrderRecord, next: OrderStage): boolean {
  // Basic guard to avoid merchant overstepping rider responsibilities.
  if (order.deliveryType === "GATIMITRA_RIDER") {
    if (next === "picked_up" || next === "delivered" || next === "rto") {
      return false;
    }
  }
  // Allow all other transitions for SELF_DELIVERY / SELF_PICKUP for now.
  return true;
}

export type OrdersState = {
  orders: OrderRecord[];
  loading: boolean;
  error: string | null;
  counts: OrderCounts;
};

export function useOrders(pollIntervalMs = 8000) {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    try {
      const list = await fetchOrdersMock();
      setOrders(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, []);

  // First load
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Lightweight polling to keep orders fresh (swap with websocket when backend is ready).
  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return undefined;
    const id = setInterval(() => {
      refetch();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, refetch]);

  const transitionOrder = useCallback((orderId: string, nextStatus: OrderStage) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        if (!canTransition(o, nextStatus)) return o;
        return { ...o, status: nextStatus };
      })
    );
  }, []);

  const counts: OrderCounts = useMemo(() => {
    const base: OrderCounts = {
      all: orders.length,
      created: 0,
      preparing: 0,
      ready: 0,
      picked_up: 0,
      delivered: 0,
      rejected: 0,
      rto: 0,
    };
    for (const o of orders) {
      base[o.status] += 1;
    }
    return base;
  }, [orders]);

  return {
    orders,
    loading,
    error,
    refetch,
    transitionOrder,
    counts,
  };
}

