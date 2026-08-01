import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  getStoreNotifications,
  markStoreNotificationRead,
  deleteStoreNotification,
  deleteAllStoreNotifications,
} from "@/services/storeNotificationsApi";
import type { StoreNotificationRow } from "@/services/storeNotificationsApi";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { loadInbox, markReadRemote, type InboxItem } from "@gatimitra/expo-push-kit";
import { getConfig } from "@/config/env";
import { readMerchantAccessToken } from "@/lib/merchantSessionStorage";
import {
  addDismissedCampaignId,
  addDismissedCampaignIds,
  readDismissedCampaignIds,
} from "@/lib/dismissedCampaignNotifications";

export type NotificationType = "order" | "store" | "system" | "earning";

/** Foreground cadence for the campaign inbox (no postgres realtime for it). */
const CAMPAIGN_POLL_MS = 10_000;

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

function mapCampaignInboxItem(item: InboxItem): MerchantNotification {
  const code = String(item.template_code ?? "").toUpperCase();
  const type: NotificationType =
    code.includes("EARNING") || code.includes("SETTLEMENT") || code.includes("WALLET")
      ? "earning"
      : code.includes("ORDER")
        ? "order"
        : code.includes("STORE")
          ? "store"
          : "system";
  return {
    id: `campaign:${item.notification_id}`,
    type,
    title: item.title?.trim() || "Notification",
    body: item.body?.trim() || "",
    timeAgo: formatTimeAgo(item.queued_at),
    dateTime: formatDateTime(item.queued_at),
    // Match backend inbox unread (`clicked_at IS NULL`). "delivered" only means
    // the push/in-app row was written — it must still count as unread.
    read: Boolean(item.clicked_at) || item.status === "clicked",
    actionUrl: item.deep_link ?? undefined,
  };
}

/**
 * Collapse twin rows from the same event (store table + campaign inbox, or
 * duplicate in_app logs from multi-token fan-out) so the bell badge and list
 * show a single notification per event.
 */
function mergeNotificationFeed(rows: MerchantNotification[]): MerchantNotification[] {
  const byId = new Map<string, MerchantNotification>();
  for (const n of rows) byId.set(n.id, n);

  const fingerprintKey = (n: MerchantNotification) => {
    const title = n.title.trim().toLowerCase();
    const body = n.body.trim().toLowerCase().slice(0, 120);
    const order = n.orderId ? `o:${n.orderId}` : "";
    return `${order}|${title}|${body}`;
  };

  const bestByFp = new Map<string, MerchantNotification>();
  for (const n of byId.values()) {
    const fp = fingerprintKey(n);
    const prev = bestByFp.get(fp);
    if (!prev) {
      bestByFp.set(fp, n);
      continue;
    }
    // Prefer unread + campaign/system rows that carry a deep link.
    const score = (x: MerchantNotification) =>
      (x.read ? 0 : 4) + (x.id.startsWith("campaign:") ? 2 : 0) + (x.actionUrl ? 1 : 0);
    if (score(n) > score(prev)) bestByFp.set(fp, n);
  }
  return [...bestByFp.values()];
}

async function fetchCampaignInbox(): Promise<MerchantNotification[]> {
  try {
    const page = await loadInbox(
      {
        baseUrl: getConfig().apiBaseUrl,
        getAuthHeader: async () => {
          const token = await readMerchantAccessToken();
          return token ? `Bearer ${token}` : null;
        },
      },
      { limit: 100 }
    );
    return (page.items ?? []).map(mapCampaignInboxItem);
  } catch {
    return [];
  }
}

/** Minimal shape lifted off an incoming push so the badge can move instantly. */
export type IncomingPushNotice = {
  notificationId?: string | null;
  title?: string | null;
  body?: string | null;
  deepLink?: string | null;
  templateCode?: string | null;
  orderId?: string | null;
};

interface NotificationContextValue {
  notifications: MerchantNotification[];
  unreadCount: number;
  loading: boolean;
  /** Mark one notification read (clears green unread dot / unread feed). */
  markAsRead: (id: string) => void;
  /** Delete one notification (store row or local campaign dismiss). */
  removeNotification: (id: string) => Promise<void>;
  /** Delete every notification for the selected store (and dismiss campaign rows). */
  clearAllNotifications: () => Promise<void>;
  refresh: () => void;
  /**
   * Paint an arriving push into the feed right away, then reconcile with the
   * server. Without this the bell badge only moves after the next fetch lands.
   */
  applyIncomingPush: (notice: IncomingPushNotice) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const [notifications, setNotifications] = useState<MerchantNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const dismissedCampaignIdsRef = useRef<Set<string>>(new Set());

  const storeId = selectedStore?.id ?? null;

  const fetchNotifications = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token || !storeId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const silent = opts?.silent === true;
    // Only the first / explicit full fetch shows the page spinner.
    // Realtime + WaitingForOrderNotifier poll via silent refresh — no spinner loop.
    if (!silent) setLoading(true);
    try {
      const [{ notifications: list }, campaign, dismissedCampaignIds] = await Promise.all([
        getStoreNotifications(storeId, token),
        fetchCampaignInbox(),
        readDismissedCampaignIds(),
      ]);
      dismissedCampaignIdsRef.current = dismissedCampaignIds;
      const storeRows = list.map(mapRowToNotification);
      // Campaign rows have no server-side delete, so honour local dismissals.
      const visibleCampaign = campaign.filter((n) => !dismissedCampaignIds.has(n.id));
      // Campaign / announcement rows first, then live store notifications.
      setNotifications(mergeNotificationFeed([...visibleCampaign, ...storeRows]));
    } catch {
      if (!silent) setNotifications([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void fetchNotifications({ silent: false });
  }, [fetchNotifications]);

  /**
   * Optimistic badge bump. Campaign / announcement pushes have no postgres
   * realtime channel, so waiting for the next inbox fetch made the bell look
   * frozen right when the notification landed.
   */
  const applyIncomingPush = useCallback(
    (notice: IncomingPushNotice) => {
      const title = String(notice.title ?? "").trim();
      const body = String(notice.body ?? "").trim();
      if (!title && !body) {
        void fetchNotifications({ silent: true });
        return;
      }
      const nid = String(notice.notificationId ?? "").trim();
      const id = nid ? `campaign:${nid}` : `push:${title}|${body}`.slice(0, 160);
      if (dismissedCampaignIdsRef.current.has(id)) return;

      const code = String(notice.templateCode ?? "").toUpperCase();
      const type: NotificationType =
        code.includes("EARNING") || code.includes("SETTLEMENT") || code.includes("WALLET")
          ? "earning"
          : code.includes("ORDER")
            ? "order"
            : code.includes("STORE")
              ? "store"
              : "system";
      const nowIso = new Date().toISOString();
      const provisional: MerchantNotification = {
        id,
        type,
        title: title || "Notification",
        body,
        timeAgo: "Just now",
        dateTime: formatDateTime(nowIso),
        read: false,
        orderId: notice.orderId ? String(notice.orderId) : undefined,
        actionUrl: notice.deepLink ?? undefined,
      };

      setNotifications((prev) => {
        if (prev.some((n) => n.id === id)) return prev;
        return mergeNotificationFeed([provisional, ...prev]);
      });
      // Reconcile (real ids, read state, server-side dedupe) right after.
      void fetchNotifications({ silent: true });
    },
    [fetchNotifications]
  );

  // Refresh inbox when the app returns to foreground so campaign unread
  // counts update even without store-table realtime events.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      void fetchNotifications({ silent: true });
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [fetchNotifications]);

  // Campaign inbox has no realtime channel — poll it while the app is in the
  // foreground so an admin announcement reaches the badge on its own.
  useEffect(() => {
    if (!token || !storeId) return;
    const id = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void fetchNotifications({ silent: true });
    }, CAMPAIGN_POLL_MS);
    return () => clearInterval(id);
  }, [token, storeId, fetchNotifications]);

  // When backend auto-clears "New order!" on deliver/cancel, drop the row without waiting for poll.
  useEffect(() => {
    if (!storeId) return;
    const supabase = getSupabaseAuth();
    if (!supabase) return;
    const ch = supabase
      .channel(`merchant_store_notifs:${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "merchant_store_notifications",
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          void fetchNotifications({ silent: true });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [storeId, fetchNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const markAsRead = useCallback(
    async (id: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      if (id.startsWith("campaign:")) {
        const nid = id.slice("campaign:".length);
        try {
          // Backend unread feed keys off clicked_at — markRead now sets that.
          await markReadRemote(
            {
              baseUrl: getConfig().apiBaseUrl,
              getAuthHeader: async () => {
                const t = await readMerchantAccessToken();
                return t ? `Bearer ${t}` : null;
              },
            },
            nid
          );
        } catch {
          // keep local read
        }
        return;
      }
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
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (id.startsWith("campaign:")) {
        // Campaign inbox rows are audit logs — persist the dismissal so the
        // next inbox fetch does not bring the row back.
        dismissedCampaignIdsRef.current.add(id);
        await addDismissedCampaignId(id);
        return;
      }
      if (token && storeId) {
        try {
          await deleteStoreNotification(storeId, id, token);
        } catch {
          void fetchNotifications({ silent: true });
        }
      }
    },
    [token, storeId, fetchNotifications]
  );

  const clearAllNotifications = useCallback(async () => {
    const campaignIds = notifications
      .filter((n) => n.id.startsWith("campaign:"))
      .map((n) => n.id);
    setNotifications([]);
    for (const id of campaignIds) dismissedCampaignIdsRef.current.add(id);
    await addDismissedCampaignIds(campaignIds);

    if (token && storeId) {
      try {
        await deleteAllStoreNotifications(storeId, token);
      } catch {
        void fetchNotifications({ silent: true });
      }
    }
  }, [notifications, token, storeId, fetchNotifications]);

  const refreshSilent = useCallback(() => {
    void fetchNotifications({ silent: true });
  }, [fetchNotifications]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      markAsRead,
      removeNotification,
      clearAllNotifications,
      refresh: refreshSilent,
      applyIncomingPush,
    }),
    [
      notifications,
      unreadCount,
      loading,
      markAsRead,
      removeNotification,
      clearAllNotifications,
      refreshSilent,
      applyIncomingPush,
    ]
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
