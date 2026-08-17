/**
 * Zomato-style Android sticky for merchant kitchen status.
 *
 * One ongoing tray row while the store is online:
 *   Title: 🟢 {Store} is online
 *   Body (idle): Waiting for orders
 *   Body (busy): 🍳 N preparing · ✅ M ready · 🛵 K out
 *                + unicode progress bar (prep / ready / OFD)
 *
 * Shared by LiveOrdersOngoingNotification (poll) and push/lifecycle handlers.
 *
 * Crash hardening: never schedule/dismiss in a tight loop. Gate flips only
 * dismiss on true→false; writers no-op when gated off (no nested dismiss).
 */

import { Platform } from "react-native";
import Constants from "expo-constants";
import { GatiMitraMerchant } from "@/constants/theme";
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

/** When false, sticky must not be shown (store closed / logged out). */
let kitchenStickyAllowed = false;
/** Serialize native schedule/dismiss so they cannot overlap and crash the process. */
let nativeBusy = false;
let pendingDismiss = false;

/**
 * Gate for all kitchen sticky writers (poll, push, order transitions).
 * Dismisses only when transitioning from allowed → blocked.
 */
export function setKitchenStickyAllowed(allowed: boolean): void {
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
 * Text progress for shade notifications (no View / CSS).
 * Rounded unicode instead of sharp █/▓/░ blocks (≈ 30px-radius pill look).
 * Segments: preparing · ready · out-for-delivery.
 */
function progressBar(prep: number, ready: number, ofd: number): string {
  const total = prep + ready + ofd;
  if (total <= 0) return "";
  const prepSeg = Math.round((prep / total) * BAR_LEN);
  const readySeg = Math.round((ready / total) * BAR_LEN);
  const ofdSeg = Math.max(0, BAR_LEN - prepSeg - readySeg);
  const chars = [
    ..."◕".repeat(prepSeg),
    ..."●".repeat(readySeg),
    ..."○".repeat(ofdSeg),
  ];
  if (chars.length === 0) return "";
  if (chars.length === 1) return "●";
  chars[0] = "◖";
  chars[chars.length - 1] = "◗";
  return chars.join("");
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
  const event = opts?.eventSubtitle?.trim();
  if (bar && event) return `${line}\n${bar}\n${event}`;
  if (bar) return `${line}\n${bar}`;
  if (event) return `${line}\n${event}`;
  return line;
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
  if (Platform.OS !== "android" || isExpoGo()) return;
  if (!kitchenStickyAllowed) return;
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
