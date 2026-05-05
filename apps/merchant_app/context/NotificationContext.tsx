import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getStoreNotifications,
  markStoreNotificationRead,
  markAllStoreNotificationsRead,
  deleteStoreNotification,
} from "@/services/storeNotificationsApi";
import type { StoreNotificationRow } from "@/services/storeNotificationsApi";

export type NotificationType = "order" | "store" | "system" | "earning";

export interface MerchantNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  timeAgo: string;
  dateTime: string;
  read: boolean;
  /** Optional order id for deep link */
  orderId?: string;
  /** Optional deep link (e.g. scheduled off page) */
  actionUrl?: string;
}

function parseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // Numeric epoch (seconds or milliseconds)
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const ms = s.length <= 10 ? n * 1000 : n;
      const dNum = new Date(ms);
      if (!Number.isNaN(dNum.getTime())) return dNum;
    }
  }

  // First attempt: let JS parse (works for ISO 8601)
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;

  // Common DB timestamp: "YYYY-MM-DD HH:mm:ss(.sss...)(TZ?)"
  // Normalize to a JS-friendly ISO-like string.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(.*)$/);
  if (m) {
    let time = m[2];
    // Trim sub-second precision to milliseconds (JS Date supports up to 3 digits).
    time = time.replace(/\.(\d{3})\d+/, ".$1");

    let tz = (m[3] ?? "").trim();
    if (tz) {
      // Normalize offsets like "+00" or "+0530" to "+00:00" / "+05:30"
      const off = tz.match(/^([+-])(\d{2})(?::?(\d{2}))?$/);
      if (off) {
        const sign = off[1];
        const hh = off[2];
        const mm = off[3] ?? "00";
        tz = `${sign}${hh}:${mm}`;
      }
    }

    const normalized = `${m[1]}T${time}${tz}`;
    const d2 = new Date(normalized);
    if (!Number.isNaN(d2.getTime())) return d2;
  }

  return null;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return String(iso);
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMs < 0) return "";
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  return d.toLocaleDateString();
}

function mapRowToNotification(r: StoreNotificationRow): MerchantNotification {
  return {
    id: r.id,
    type: r.type as NotificationType,
    title: r.title,
    body: r.body,
    timeAgo: formatTimeAgo(r.created_at),
    dateTime: formatDateTime(r.created_at),
    read: r.read,
    orderId: r.order_id != null ? String(r.order_id) : undefined,
    actionUrl: r.action_url != null ? String(r.action_url) : undefined,
  };
}

interface NotificationContextValue {
  notifications: MerchantNotification[];
  unreadCount: number;
  loading: boolean;
  markAllAsRead: () => Promise<void>;
  markAsRead: (id: string) => void;
  removeNotification: (id: string) => Promise<void>;
  refresh: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [notifications, setNotifications] = useState<MerchantNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const storeId = selectedStore?.id ?? null;

  const fetchNotifications = useCallback(async () => {
    if (!token || !storeId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { notifications: list } = await getStoreNotifications(storeId, token);
      setNotifications(list.map(mapRowToNotification));
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (token && storeId) {
      try {
        await markAllStoreNotificationsRead(storeId, token);
      } catch {
        void fetchNotifications();
      }
    }
  }, [token, storeId, fetchNotifications]);

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      if (token && storeId) {
        try {
          await markStoreNotificationRead(storeId, id, token);
        } catch {
          // Keep it marked as read locally even if backend call fails.
        }
      }
    },
    [token, storeId]
  );

  const removeNotification = useCallback(
    async (id: string) => {
      const prev = notifications.filter((n) => n.id !== id);
      setNotifications(prev);
      if (token && storeId) {
        try {
          await deleteStoreNotification(storeId, id, token);
        } catch {
          void fetchNotifications();
        }
      }
    },
    [token, storeId, notifications, fetchNotifications]
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      markAllAsRead,
      markAsRead,
      removeNotification,
      refresh: fetchNotifications,
    }),
    [notifications, unreadCount, loading, markAllAsRead, markAsRead, removeNotification, fetchNotifications]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
