/**
 * Zomato-style Android sticky for merchant kitchen status.
 *
 * Shows an ongoing "🟢 {store} is online · Waiting for orders" tray row while
 * the store is open (see LiveOrdersOngoingNotification). Server push for
 * store_online / go-online is also enabled in pushBackgroundTask.
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { GatiMitraMerchant } from "@/constants/theme";
import { isAppForeground } from "@/lib/appForeground";
import {
  getActiveOrdersBreakdown,
  type ActiveOrdersBreakdown,
} from "@/services/storeSettingsApi";

export const LIVE_ORDERS_ONGOING_ID = "merchant-live-orders-ongoing";
/** Legacy idle id — dismiss so only one sticky shows. */
export const LEGACY_ONLINE_NOTIF_ID = "merchant-store-online-status";
export const LIVE_ORDERS_CHANNEL_ID = "merchant_live_orders";
export const LIVE_ORDERS_HREF = "/(tabs)/orders?tab=active";

const BAR_LEN = 12;

/** Zomato-style ongoing tray while the store is online (waiting for orders / kitchen status). */
const KITCHEN_STICKY_ENABLED = true;

/** When false, sticky must not be shown (store closed / logged out / feature off). */
let kitchenStickyAllowed = false;
/** Serialize native schedule/dismiss so they cannot overlap and crash the process. */
let nativeBusy = false;
let pendingDismiss = false;

/**
 * Gate for all kitchen sticky writers (poll, push, order transitions).
 * Dismisses only when transitioning from allowed → blocked.
 */
export function setKitchenStickyAllowed(allowed: boolean): void {
  if (!KITCHEN_STICKY_ENABLED) {
    const was = kitchenStickyAllowed;
    kitchenStickyAllowed = false;
    if (was || allowed) {
      void dismissLiveOrdersOngoingNotification();
    }
    return;
  }
  const was = kitchenStickyAllowed;
  kitchenStickyAllowed = allowed;
  if (was && !allowed) {
    void dismissLiveOrdersOngoingNotification();
  }
}

export function isKitchenStickyAllowed(): boolean {
  return kitchenStickyAllowed;
}

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

let channelReady = false;
let lastSignature: string | null = null;
let inFlight = false;

async function loadNotifications() {
  return import("expo-notifications");
}

async function ensureChannel(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  if (channelReady || Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(LIVE_ORDERS_CHANNEL_ID, {
      name: "Live kitchen status",
      importance: Notifications.AndroidImportance.LOW,
      sound: undefined,
      vibrationPattern: undefined,
      enableVibrate: false,
      showBadge: true,
    });
    channelReady = true;
  } catch {
    /* best-effort */
  }
}

/**
 * Compact status fractions for shade notifications (no View / CSS).
 * Avoids dense unicode "pill" glyphs that render as (●●●●●…) on many Android fonts.
 * Example: `Prep 1  ·  Ready 0  ·  Out 0` with a simple `▓▓▓░░░░░░░` meter.
 */
function progressBar(prep: number, ready: number, ofd: number): string {
  const total = prep + ready + ofd;
  if (total <= 0) return "";
  const prepSeg = Math.round((prep / total) * BAR_LEN);
  const readySeg = Math.round((ready / total) * BAR_LEN);
  const ofdSeg = Math.max(0, BAR_LEN - prepSeg - readySeg);
  const filled = "▓".repeat(Math.max(0, prepSeg));
  const mid = "▒".repeat(Math.max(0, readySeg));
  const empty = "░".repeat(Math.max(0, ofdSeg));
  return `${filled}${mid}${empty}`;
}

export function formatKitchenStickyBody(
  breakdown: ActiveOrdersBreakdown,
  opts?: { eventSubtitle?: string | null }
): string {
  const parts: string[] = [];
  if (breakdown.preparing > 0) parts.push(`🍳 ${breakdown.preparing} preparing`);
  if (breakdown.ready > 0) parts.push(`✅ ${breakdown.ready} ready`);
  if (breakdown.out_for_delivery > 0) {
    parts.push(`🛵 ${breakdown.out_for_delivery} out`);
  }
  if (breakdown.pending_accept > 0) {
    parts.push(`🔔 ${breakdown.pending_accept} new`);
  }
  const line =
    parts.length > 0 ? parts.join("  ·  ") : "Waiting for orders";
  const bar = progressBar(
    breakdown.preparing,
    breakdown.ready,
    breakdown.out_for_delivery
  );
  const legend =
    breakdown.preparing + breakdown.ready + breakdown.out_for_delivery > 0
      ? `Prep ${breakdown.preparing} · Ready ${breakdown.ready} · Out ${breakdown.out_for_delivery}`
      : "";
  const event = opts?.eventSubtitle?.trim();
  const chunks = [line];
  if (bar) chunks.push(bar);
  if (legend) chunks.push(legend);
  if (event) chunks.push(event);
  return chunks.join("\n");
}

export function formatKitchenStickyTitle(storeName: string): string {
  const name = storeName.trim() || "Your restaurant";
  return `🟢 ${name} is online`;
}

export async function dismissLiveOrdersOngoingNotification(): Promise<void> {
  if (Platform.OS !== "android" || isExpoGo()) return;
  lastSignature = null;
  if (nativeBusy) {
    pendingDismiss = true;
    return;
  }
  nativeBusy = true;
  try {
    const Notifications = await loadNotifications();
    await Notifications.dismissNotificationAsync(LIVE_ORDERS_ONGOING_ID);
    await Notifications.dismissNotificationAsync(LEGACY_ONLINE_NOTIF_ID);
  } catch {
    /* best-effort */
  } finally {
    nativeBusy = false;
    if (pendingDismiss) {
      pendingDismiss = false;
      if (!kitchenStickyAllowed) {
        void dismissLiveOrdersOngoingNotification();
      }
    }
  }
}

export type KitchenStickyOpts = {
  storeName: string;
  breakdown: ActiveOrdersBreakdown;
  /** Optional one-line event (e.g. “Order #GMF… is ready”). */
  eventSubtitle?: string | null;
  force?: boolean;
};

export async function showOrUpdateKitchenSticky(
  opts: KitchenStickyOpts
): Promise<void> {
  if (!KITCHEN_STICKY_ENABLED) return;
  if (Platform.OS !== "android" || isExpoGo()) return;
  // Soft gate — do not dismiss here (avoids schedule/dismiss thrash → native crash).
  if (!kitchenStickyAllowed) return;
  if (nativeBusy) return;

  const title = formatKitchenStickyTitle(opts.storeName);
  const body = formatKitchenStickyBody(opts.breakdown, {
    eventSubtitle: opts.eventSubtitle,
  });
  const signature = `${title}|${body}|${opts.breakdown.active_orders}`;
  if (!opts.force && signature === lastSignature) return;

  nativeBusy = true;
  try {
    if (!kitchenStickyAllowed) return;
    const Notifications = await loadNotifications();
    await ensureChannel(Notifications);
    try {
      await Notifications.dismissNotificationAsync(LEGACY_ONLINE_NOTIF_ID);
    } catch {
      /* ignore */
    }
    await Notifications.scheduleNotificationAsync({
      identifier: LIVE_ORDERS_ONGOING_ID,
      content: {
        title,
        body,
        data: {
          type: "live_orders",
          url: LIVE_ORDERS_HREF,
          screen: "orders",
          preparing: opts.breakdown.preparing,
          ready: opts.breakdown.ready,
          out_for_delivery: opts.breakdown.out_for_delivery,
          pending_accept: opts.breakdown.pending_accept,
          active_orders: opts.breakdown.active_orders,
        },
        color: GatiMitraMerchant.primary,
        sticky: true,
        autoDismiss: false,
        sound: undefined,
        ...(Platform.OS === "android" ? { channelId: LIVE_ORDERS_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    lastSignature = signature;
  } catch {
    /* best-effort */
  } finally {
    nativeBusy = false;
    if (pendingDismiss || !kitchenStickyAllowed) {
      pendingDismiss = false;
      void dismissLiveOrdersOngoingNotification();
    }
  }
}

/** @deprecated Prefer showOrUpdateKitchenSticky — kept for call sites that only have a count. */
export async function showOrUpdateLiveOrdersOngoingNotification(
  count: number,
  opts?: { subtitle?: string | null; force?: boolean; storeName?: string }
): Promise<void> {
  await showOrUpdateKitchenSticky({
    storeName: opts?.storeName ?? "Your restaurant",
    breakdown: {
      active_orders: Math.max(0, count),
      pending_accept: 0,
      preparing: Math.max(0, count),
      ready: 0,
      out_for_delivery: 0,
    },
    eventSubtitle: opts?.subtitle,
    force: opts?.force,
  });
}

/**
 * Refresh sticky from API breakdown. Call after transitions / on lifecycle push.
 */
export async function refreshLiveOrdersOngoingNotification(args: {
  storeId: number;
  token: string;
  storeName?: string | null;
  subtitle?: string | null;
  force?: boolean;
}): Promise<void> {
  if (!KITCHEN_STICKY_ENABLED) return;
  if (Platform.OS !== "android" || isExpoGo()) return;
  if (!kitchenStickyAllowed) return;
  if (!args.force && !isAppForeground()) return;
  if (inFlight || nativeBusy) return;
  inFlight = true;
  try {
    const breakdown = await getActiveOrdersBreakdown(args.storeId, args.token);
    if (!kitchenStickyAllowed) return;
    await showOrUpdateKitchenSticky({
      storeName: args.storeName?.trim() || "Your restaurant",
      breakdown,
      eventSubtitle: args.subtitle,
      force: args.force ?? Boolean(args.subtitle),
    });
  } catch {
    /* keep last shown */
  } finally {
    inFlight = false;
  }
}

/**
 * Apply count / breakdown embedded in a push payload.
 */
export async function applyLiveOrdersCountFromPush(args: {
  activeOrdersCount: number;
  storeName?: string | null;
  subtitle?: string | null;
  preparing?: number | null;
  ready?: number | null;
  outForDelivery?: number | null;
  pendingAccept?: number | null;
}): Promise<void> {
  if (!KITCHEN_STICKY_ENABLED) return;
  if (!kitchenStickyAllowed) return;
  const active = Math.max(0, Math.floor(Number(args.activeOrdersCount) || 0));
  const preparing = Math.max(0, Math.floor(Number(args.preparing ?? 0) || 0));
  const ready = Math.max(0, Math.floor(Number(args.ready ?? 0) || 0));
  const out_for_delivery = Math.max(
    0,
    Math.floor(Number(args.outForDelivery ?? 0) || 0)
  );
  const pending_accept = Math.max(
    0,
    Math.floor(Number(args.pendingAccept ?? 0) || 0)
  );
  const hasStages = preparing + ready + out_for_delivery + pending_accept > 0;
  await showOrUpdateKitchenSticky({
    storeName: args.storeName?.trim() || "Your restaurant",
    breakdown: {
      active_orders: active,
      pending_accept,
      preparing: hasStages ? preparing : active,
      ready,
      out_for_delivery,
    },
    eventSubtitle: args.subtitle,
    force: true,
  });
}

export function resetLiveOrdersOngoingCache(): void {
  lastSignature = null;
  channelReady = false;
  kitchenStickyAllowed = false;
  inFlight = false;
  nativeBusy = false;
  pendingDismiss = false;
}
