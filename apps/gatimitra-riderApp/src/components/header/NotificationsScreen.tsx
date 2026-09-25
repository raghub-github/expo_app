/**
 * Rider notifications — filtered API inbox (cancelled / penalty / admin).
 * New-order dispatch pushes stay out of this page (OS + accept modal only).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, AppState } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { InboxScreen, type InboxItem, type NotificationApiConfig } from "@gatimitra/expo-push-kit";
import { router } from "expo-router";
import { getRiderAppConfig } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import { colors } from "@/src/theme";
import {
  addRiderDismissedNotificationIds,
  readRiderDismissedNotificationIds,
} from "@/src/lib/riderDismissedNotifications";
import { filterRiderInboxPageItems } from "@/src/lib/riderInboxFilter";
import {
  refreshRiderInboxUnread,
  useRiderInboxUnreadStore,
} from "@/src/stores/riderInboxUnreadStore";
import { useNotificationInboxStore } from "@/src/stores/notificationInboxStore";
import { RiderNotificationDetailSheet } from "@/src/components/header/RiderNotificationDetailSheet";

const BG_GRADIENT = ["#E6F7F4", "#F5FBFF", "#FFF5F7"] as const;

const RIDER_FALLBACK = "/(tabs)/orders";

const RIDER_ROUTE_PREFIXES = [
  "/(tabs)",
  "/active-ride/",
  "/active-food/",
  "/notifications",
  "/notification-settings",
  "/my-rides",
  "/order-history/",
  "/order-partner-chat/",
  "/ride-payment-waiting",
  "/ride-delivery-success",
  "/food-delivery-success",
  "/your-subscription",
  "/payout-accounts",
  "/payment-details",
  "/vehicles",
  "/view-vehicle",
  "/view-profile",
  "/view-documents",
  "/referrals",
  "/referral-details/",
  "/device-sessions",
  "/team-leader",
  "/raise-ticket",
  "/my-tickets",
  "/ticket-chat/",
  "/onboarding-help",
];

function normalizePath(deepLink: string): string {
  let path = deepLink.trim();
  if (!path) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
      const u = new URL(path);
      path = `${u.pathname}${u.search}` || "";
    }
  } catch {
    /* keep path */
  }
  if (!path.startsWith("/")) path = `/${path}`;
  path = path.replace(/\/{2,}/g, "/");
  return path;
}

function isAllowedRiderPath(path: string): boolean {
  return RIDER_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix)
  );
}

export function resolveRiderNotificationHref(
  deepLink: string,
  item?: InboxItem
): string {
  const path = normalizePath(deepLink);
  if (!path) {
    return RIDER_FALLBACK;
  }

  if (path === "/home" || path.startsWith("/home/")) return RIDER_FALLBACK;
  if (path === "/orders" || path === "/(tabs)/orders") return RIDER_FALLBACK;
  if (path.startsWith("/orders/")) return RIDER_FALLBACK;
  if (path === "/notifications" || path.startsWith("/notifications")) {
    return "/notifications";
  }
  if (path.startsWith("/order/") && !path.startsWith("/order-history")) {
    return RIDER_FALLBACK;
  }

  if (isAllowedRiderPath(path)) return path;
  return RIDER_FALLBACK;
}

function linkIsActionable(deepLink: string): boolean {
  const raw = deepLink.trim();
  if (!raw) return false;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return false;
  const href = resolveRiderNotificationHref(raw);
  return href !== "/notifications";
}

export function NotificationsScreen() {
  const apiConfig = useMemo<NotificationApiConfig>(
    () => ({
      baseUrl: getRiderAppConfig().apiBaseUrl,
      getAuthHeader: async () => {
        const token = useSessionStore.getState().session?.accessToken;
        return token ? `Bearer ${token}` : null;
      },
    }),
    []
  );

  const setUnread = useRiderInboxUnreadStore((s) => s.setUnread);
  const [detail, setDetail] = useState<InboxItem | null>(null);

  const getDismissedIds = useCallback(() => readRiderDismissedNotificationIds(), []);
  const persistDismissedIds = useCallback(
    (ids: string[]) => addRiderDismissedNotificationIds(ids),
    []
  );

  useEffect(() => {
    refreshRiderInboxUnread();
  }, []);

  const onInboxStats = useCallback(
    (stats: { unread: number; total: number }) => {
      setUnread(stats.unread);
    },
    [setUnread]
  );

  const onCleared = useCallback(() => {
    useNotificationInboxStore.getState().markAllRead();
    useNotificationInboxStore.setState({ items: [] });
    setUnread(0);
    // Reconcile with dismissed storage + filtered API (after Clear all persist).
    refreshRiderInboxUnread();
  }, [setUnread]);

  const onItemPress = useCallback((item: InboxItem) => {
    setDetail(item);
    refreshRiderInboxUnread();
  }, []);

  const closeDetail = useCallback(() => setDetail(null), []);

  const openDetailLink = useCallback(() => {
    if (!detail) return;
    const link = (detail.deep_link ?? "").trim();
    setDetail(null);
    try {
      const href = resolveRiderNotificationHref(link, detail);
      router.push(href as never);
    } catch {
      try {
        router.replace(RIDER_FALLBACK as never);
      } catch {
        /* ignore */
      }
    }
  }, [detail]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <InboxScreen
          apiConfig={apiConfig}
          accentColor={colors.primary[600]}
          emptyText="No notifications yet."
          getDismissedIds={getDismissedIds}
          persistDismissedIds={persistDismissedIds}
          filterItems={filterRiderInboxPageItems}
          onInboxStats={onInboxStats}
          onCleared={onCleared}
          onItemPress={onItemPress}
        />
      </SafeAreaView>
      <RiderNotificationDetailSheet
        visible={detail != null}
        item={detail}
        onClose={closeDetail}
        hasLink={!!detail && linkIsActionable(detail.deep_link ?? "")}
        onOpenLink={openDetailLink}
      />
    </View>
  );
}

/** Mount once under tabs chrome — keeps bell badge synced with filtered inbox. */
export function RiderInboxUnreadBootstrap() {
  const refresh = useRiderInboxUnreadStore((s) => s.refresh);
  const hasSession = useSessionStore((s) => Boolean(s.session?.accessToken));

  useEffect(() => {
    if (!hasSession) {
      useRiderInboxUnreadStore.getState().setUnread(0);
      return;
    }
    void refresh();
  }, [hasSession, refresh]);

  useEffect(() => {
    if (!hasSession) return;
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refresh();
    });
    return () => sub.remove();
  }, [hasSession, refresh]);

  return null;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_GRADIENT[0] },
  safe: { flex: 1 },
});
