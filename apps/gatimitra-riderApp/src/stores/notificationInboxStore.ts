import { create } from "zustand";

export type RiderNotificationType = "order" | "earnings" | "account" | "promo" | "general";

export type RiderNotificationItem = {
  id: string;
  type: RiderNotificationType;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
};

type NotificationInboxStore = {
  items: RiderNotificationItem[];
  add: (item: Omit<RiderNotificationItem, "id" | "read" | "createdAt"> & Partial<Pick<RiderNotificationItem, "id" | "createdAt">>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  unreadCount: () => number;
};

function inferType(data?: Record<string, unknown>): RiderNotificationType {
  const raw = String(data?.gmType ?? data?.template_code ?? data?.type ?? "").toUpperCase();
  if (raw.includes("ORDER")) return "order";
  if (
    raw.includes("EARN") ||
    raw.includes("PAYOUT") ||
    raw.includes("WALLET") ||
    raw.includes("PENALTY")
  ) {
    return "earnings";
  }
  if (
    raw.includes("KYC") ||
    raw.includes("VERIFY") ||
    raw.includes("VEHICLE") ||
    raw.includes("ACCOUNT") ||
    raw.includes("BLACKLIST") ||
    raw.includes("SUSPEND") ||
    raw.includes("DEACTIVAT") ||
    raw.includes("REACTIVAT") ||
    raw.includes("ACTIVATED")
  ) {
    return "account";
  }
  if (raw.includes("OFFER") || raw.includes("PROMO")) return "promo";
  return "general";
}

export function notificationFromPushPayload(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): RiderNotificationItem {
  return {
    id: `push-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: inferType(data),
    title: title.trim() || "GatiMitra",
    body: body.trim(),
    createdAt: Date.now(),
    read: false,
  };
}

export const useNotificationInboxStore = create<NotificationInboxStore>((set, get) => ({
  items: [],
  add: (item) =>
    set((state) => {
      const next: RiderNotificationItem = {
        id: item.id ?? `n-${Date.now()}`,
        type: item.type,
        title: item.title,
        body: item.body,
        createdAt: item.createdAt ?? Date.now(),
        read: false,
      };
      return { items: [next, ...state.items].slice(0, 100) };
    }),
  markRead: (id) =>
    set((state) => ({
      items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  markAllRead: () =>
    set((state) => ({
      items: state.items.map((n) => ({ ...n, read: true })),
    })),
  unreadCount: () => get().items.filter((n) => !n.read).length,
}));
