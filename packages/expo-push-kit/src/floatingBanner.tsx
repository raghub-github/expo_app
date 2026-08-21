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
/** Recently shown notification_ids — stops Expo+FCM double delivery from stacking banners. */
const recentlyShownBannerIds = new Map<string, number>();
const BANNER_DEDUPE_MS = 15_000;

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

/** Order-page / admin CX sends belong in the OS shade, not the in-app pill. */
export function isSystemShadeOnlyPush(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  if (data.skip_in_app_banner === true || data.skip_in_app_banner === "true") return true;
  if (data.admin_cx === true || data.admin_cx === "true") return true;
  const gmType = typeof data.gmType === "string" ? data.gmType : "";
  const template =
    (typeof data.template_code === "string" && data.template_code) ||
    (typeof data.templateCode === "string" && data.templateCode) ||
    gmType;
  if (template.toUpperCase().startsWith("ADMIN_CX_")) return true;
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
    (typeof data.gmTitle === "string" && data.gmTitle.trim()) ||
    (typeof data.title === "string" && data.title.trim()) ||
    payload.title?.trim() ||
    "";
  const body =
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
  // Same push can arrive via Expo + FCM on one device — only show one banner.
  // Prefer notification_id; fall back to title+body fingerprint for twin payloads.
  const dedupeKey =
    notificationId ||
    `t:${titleText.trim().toLowerCase()}|${String(bodyText ?? "").trim().toLowerCase().slice(0, 80)}`;
  {
    if (current?.id === dedupeKey) return;
    if (queue.some((item) => item.id === dedupeKey)) return;
    const now = Date.now();
    for (const [k, at] of recentlyShownBannerIds) {
      if (now - at > BANNER_DEDUPE_MS) recentlyShownBannerIds.delete(k);
    }
    if (recentlyShownBannerIds.has(dedupeKey)) return;
    recentlyShownBannerIds.set(dedupeKey, now);
  }

  enqueueInAppBanner({
    id: dedupeKey,
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
  const translateY = useSharedValue(-52);
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
      translateY.value = -52;
      opacity.value = 0;
      return;
    }

    translateY.value = withSpring(0, { damping: 16, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 180 });

    hideTimerRef.current = setTimeout(() => {
      translateY.value = withTiming(-52, { duration: EXIT_MS });
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

  const message = item.body?.trim() ? `${item.title} · ${item.body}` : item.title;

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
        accessibilityLabel={message}
      >
        <View style={styles.dot} />
        <Text style={styles.text} numberOfLines={1}>
          {message}
        </Text>
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
    left: 20,
    right: 20,
    zIndex: 1000,
    elevation: 1000,
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    paddingBottom: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#99F6E4",
    maxWidth: "100%",
    minHeight: 34,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#0f766e",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0D9488",
  },
  text: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 16,
  },
  progressTrack: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 4,
    height: 2,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    borderRadius: 999,
    backgroundColor: "#0F172A",
  },
});
