/**
 * Universal floating in-app notification banner + sequential queue.
 * Reuses the Pickup Updated visual language (pill below safe area / above map).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PushNotificationOpenPayload } from "./listeners";

const DISPLAY_MS = 5000;
const EXIT_MS = 280;

export type InAppBannerItem = {
  id: string;
  title: string;
  body?: string | null;
  deepLink?: string | null;
  templateCode?: string | null;
  data?: Record<string, unknown>;
  /** 0–1 fill for the thin bottom progress accent. */
  progress?: number | null;
};

type Listener = () => void;

const queue: InAppBannerItem[] = [];
let current: InAppBannerItem | null = null;
const listeners = new Set<Listener>();
let seq = 0;
/** Recently shown keys — stops Expo+FCM twins and inbox-poll replays. */
const recentlyShownBannerIds = new Map<string, number>();
const TWIN_PUSH_DEDUPE_MS = 15_000;
const ORDER_EVENT_DEDUPE_MS = 6 * 60 * 60 * 1000;

const PICKUP_ARRIVAL_FAMILY = new Set([
  "CUSTOMER_PICKUP_OTP_ARRIVED",
  "RIDE_RIDER_NEARBY",
]);

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function nextId(): string {
  seq += 1;
  return `banner-${Date.now()}-${seq}`;
}

function pruneBannerDedupe(now: number): void {
  for (const [k, at] of recentlyShownBannerIds) {
    const windowMs = k.startsWith("t:") ? TWIN_PUSH_DEDUPE_MS : ORDER_EVENT_DEDUPE_MS;
    if (now - at > windowMs) recentlyShownBannerIds.delete(k);
  }
}

function orderIdFromData(data: Record<string, unknown> | undefined | null): string {
  if (!data) return "";
  const direct = typeof data.orderId === "string" ? data.orderId.trim() : "";
  if (direct) return direct;
  const deep =
    (typeof data.deepLink === "string" && data.deepLink) ||
    (typeof data.deep_link === "string" && data.deep_link) ||
    (typeof data.screen === "string" && data.screen) ||
    "";
  const match = deep.match(/\/orders\/([^/?#]+)/i);
  return match?.[1]?.trim() ?? "";
}

function templateFromData(
  data: Record<string, unknown> | undefined | null,
  fallback?: string | null
): string {
  if (!data) return (fallback ?? "").trim().toUpperCase();
  const gmType = typeof data.gmType === "string" ? data.gmType : "";
  const template =
    (typeof data.template_code === "string" && data.template_code) ||
    (typeof data.templateCode === "string" && data.templateCode) ||
    gmType ||
    fallback ||
    "";
  return template.trim().toUpperCase();
}

function bannerDedupeKeys(args: {
  id?: string | null;
  title: string;
  body?: string | null;
  templateCode?: string | null;
  data?: Record<string, unknown>;
}): string[] {
  const keys: string[] = [];
  const id = args.id?.trim();
  if (id) keys.push(`id:${id}`);
  const orderId = orderIdFromData(args.data);
  const template = templateFromData(args.data, args.templateCode);
  if (orderId && template) {
    keys.push(`evt:${orderId}:${template}`);
    if (PICKUP_ARRIVAL_FAMILY.has(template)) {
      keys.push(`pickup-arrived:${orderId}`);
    }
  }
  keys.push(
    `t:${args.title.trim().toLowerCase()}|${String(args.body ?? "").trim().toLowerCase().slice(0, 80)}`
  );
  return keys;
}

function itemMatchesKey(item: InAppBannerItem, key: string): boolean {
  if (item.id === key) return true;
  return bannerDedupeKeys({
    id: item.id,
    title: item.title,
    body: item.body,
    templateCode: item.templateCode,
    data: item.data,
  }).includes(key);
}

function isBannerKeyActive(key: string, now: number): boolean {
  if (current && itemMatchesKey(current, key)) return true;
  if (queue.some((item) => itemMatchesKey(item, key))) return true;
  const at = recentlyShownBannerIds.get(key);
  if (at == null) return false;
  const windowMs = key.startsWith("t:") ? TWIN_PUSH_DEDUPE_MS : ORDER_EVENT_DEDUPE_MS;
  return now - at < windowMs;
}

/** Returns false when this event was already shown for this ride/order. */
function claimBannerDedupe(keys: string[]): boolean {
  const now = Date.now();
  pruneBannerDedupe(now);
  if (keys.some((k) => isBannerKeyActive(k, now))) return false;
  for (const k of keys) recentlyShownBannerIds.set(k, now);
  return true;
}

function orderServiceFromPushData(
  data: Record<string, unknown>
): "food" | "ride" | "parcel" | null {
  const live = String(data.liveService ?? "").trim().toLowerCase();
  if (live === "food") return "food";
  if (live === "ride" || live === "person_ride") return "ride";
  if (live === "parcel") return "parcel";

  const orderId = orderIdFromData(data).toUpperCase();
  if (/^GMF\d*/.test(orderId)) return "food";
  if (/^GMP\d*/.test(orderId)) return "ride";
  if (/^GMC\d*/.test(orderId) || /^GMX\d*/.test(orderId) || /^GMPARCEL/i.test(orderId)) {
    return "parcel";
  }
  return null;
}

/**
 * Food-order customer pushes — show in the OS shade only, never the in-app pill.
 * Person-ride and parcel keep the floating banner.
 */
export function isFoodOrderPush(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;

  const service = orderServiceFromPushData(data);
  if (service === "ride" || service === "parcel") return false;
  if (service === "food") return true;

  const code = templateFromData(data, null);
  if (code.startsWith("RIDE_")) return false;
  if (code.startsWith("PARCEL_")) return false;

  if (code.startsWith("ORDER_")) {
    if (code === "ORDER_RIDER_ASSIGNED") return service !== "ride";
    return true;
  }
  if (code === "ORDER_PREP_DELAY") return true;

  return false;
}

/** Order-page / admin CX / live sticky / food orders belong in the OS shade, not the in-app pill. */
export function isSystemShadeOnlyPush(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  if (isFoodOrderPush(data)) return true;
  if (data.gmLiveProgress === true || data.gmLiveProgress === "true") return true;
  if (data.skip_in_app_banner === true || data.skip_in_app_banner === "true") return true;
  if (data.admin_cx === true || data.admin_cx === "true") return true;
  const role = String(data.appRole ?? data.role ?? "").toLowerCase();
  if (role === "merchant") return true;
  const type = String(data.type ?? data.notificationType ?? data.event ?? "").toLowerCase();
  if (
    type.startsWith("merchant_") ||
    type === "store_online" ||
    type === "new_order"
  ) {
    return true;
  }
  const gmType = typeof data.gmType === "string" ? data.gmType : "";
  const template =
    (typeof data.template_code === "string" && data.template_code) ||
    (typeof data.templateCode === "string" && data.templateCode) ||
    gmType;
  const code = template.toUpperCase();
  if (code.startsWith("ADMIN_CX_")) return true;
  if (code.startsWith("MERCHANT_")) return true;
  // Campaign announcements belong in the OS shade only — never the floating pill.
  if (
    code === "CUSTOMER_ANNOUNCEMENT" ||
    code === "MERCHANT_ANNOUNCEMENT" ||
    code === "RIDER_ANNOUNCEMENT" ||
    code.endsWith("_ANNOUNCEMENT")
  ) {
    return true;
  }
  return false;
}

function progressFromPush(data: Record<string, unknown>): number | null {
  const step = Number(data.liveStep);
  const steps = Number(data.liveSteps);
  if (Number.isFinite(step) && Number.isFinite(steps) && steps > 0) {
    return Math.max(0.08, Math.min(1, step / steps));
  }
  return null;
}

export function enqueueInAppBanner(item: Omit<InAppBannerItem, "id"> & { id?: string }): void {
  const title = item.title?.trim();
  if (!title) return;
  if (isSystemShadeOnlyPush(item.data)) return;
  const keys = bannerDedupeKeys({
    id: item.id,
    title,
    body: item.body,
    templateCode: item.templateCode,
    data: item.data,
  });
  if (!claimBannerDedupe(keys)) return;
  queue.push({
    id: item.id ?? nextId(),
    title,
    body: item.body ?? null,
    deepLink: item.deepLink ?? null,
    templateCode: item.templateCode ?? null,
    data: item.data,
    progress: item.progress ?? progressFromPush(item.data ?? {}),
  });
  pumpQueue();
}

/** Enqueue from a rendered push payload (template title/body already substituted). */
export function enqueueInAppBannerFromPush(payload: PushNotificationOpenPayload): void {
  const data = payload.data ?? {};
  const gmType = typeof data.gmType === "string" ? data.gmType : "";
  // Prep-delay / rich modals have dedicated UI — skip generic banner.
  if (gmType === "ORDER_PREP_DELAY" || gmType === "RICH") return;
  if (isSystemShadeOnlyPush(data)) return;

  const title =
    (typeof data.liveTitle === "string" && data.liveTitle.trim()) ||
    (typeof data.gmTitle === "string" && data.gmTitle.trim()) ||
    (typeof data.title === "string" && data.title.trim()) ||
    payload.title?.trim() ||
    "";
  const body =
    (typeof data.liveBody === "string" && data.liveBody.trim()) ||
    (typeof data.gmMessage === "string" && data.gmMessage.trim()) ||
    (typeof data.body === "string" && data.body.trim()) ||
    payload.body?.trim() ||
    null;
  if (!title && !body) return;

  const deepLink =
    (typeof data.deepLink === "string" && data.deepLink) ||
    (typeof data.deep_link === "string" && data.deep_link) ||
    (typeof data.screen === "string" && data.screen) ||
    null;

  const notificationId =
    (typeof data.notification_id === "string" && data.notification_id.trim()) ||
    (typeof data.notificationId === "string" && data.notificationId.trim()) ||
    null;

  const titleText = title || body || "Update";
  const bodyText = title ? body : null;

  enqueueInAppBanner({
    id: notificationId ?? undefined,
    title: titleText,
    body: bodyText,
    deepLink,
    templateCode: typeof data.template_code === "string" ? data.template_code : gmType || null,
    data,
    progress: progressFromPush(data),
  });
}

function pumpQueue(): void {
  if (current || queue.length === 0) {
    emit();
    return;
  }
  current = queue.shift() ?? null;
  emit();
}

export function dismissCurrentInAppBanner(): void {
  current = null;
  emit();
  // Slight gap so exit animation can finish before next slide-in.
  setTimeout(() => pumpQueue(), 40);
}

export function getInAppBannerSnapshot(): {
  current: InAppBannerItem | null;
  pending: number;
} {
  return { current, pending: queue.length };
}

export function subscribeInAppBanner(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

type HostProps = {
  /** Extra top offset below status bar (e.g. under a custom header). */
  topOffset?: number;
  onPressBanner?: (item: InAppBannerItem) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mount once near the root of each app. Renders the queued banner with
 * slide-down / fade-in → hold ~5s → fade-out / slide-up.
 */
export function FloatingInAppBannerHost({ topOffset = 8, onPressBanner, style }: HostProps) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<InAppBannerItem | null>(current);
  const translateY = useSharedValue(-72);
  const opacity = useSharedValue(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeInAppBanner(() => {
      setItem(current);
    });
  }, []);

  const finishDismiss = useCallback(() => {
    dismissCurrentInAppBanner();
  }, []);

  useEffect(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (!item) {
      translateY.value = -72;
      opacity.value = 0;
      return;
    }

    translateY.value = withSpring(0, { damping: 16, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 180 });

    hideTimerRef.current = setTimeout(() => {
      translateY.value = withTiming(-72, { duration: EXIT_MS });
      opacity.value = withTiming(0, { duration: EXIT_MS }, (finished) => {
        if (finished) runOnJS(finishDismiss)();
      });
    }, DISPLAY_MS);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [item, finishDismiss, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!item) return null;

  const body = item.body?.trim() || "";
  const a11y = body ? `${item.title}. ${body}` : item.title;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        { top: Math.max(insets.top, Platform.OS === "android" ? 28 : 12) + topOffset },
        style,
        animStyle,
      ]}
    >
      <Pressable
        onPress={() => onPressBanner?.(item)}
        style={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={a11y}
      >
        <View style={styles.dotCol}>
          <View style={styles.dot} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {body ? (
            <Text style={styles.body} numberOfLines={2}>
              {body}
            </Text>
          ) : null}
        </View>
        <View style={styles.progressTrack} pointerEvents="none">
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round((item.progress ?? 1) * 100)}%` },
            ]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 1000,
    elevation: 1000,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F0FDFA",
    borderRadius: 20,
    paddingVertical: 11,
    paddingHorizontal: 14,
    paddingBottom: 13,
    borderWidth: 1,
    borderColor: "#99F6E4",
    maxWidth: "100%",
    minHeight: 48,
    width: "100%",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f766e",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  dotCol: {
    paddingTop: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0D9488",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 18,
  },
  body: {
    fontSize: 12,
    fontWeight: "500",
    color: "#334155",
    lineHeight: 16,
  },
  progressTrack: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 5,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#CCFBF1",
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "#0D9488",
  },
});
