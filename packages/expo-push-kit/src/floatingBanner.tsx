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
};

type Listener = () => void;

const queue: InAppBannerItem[] = [];
let current: InAppBannerItem | null = null;
const listeners = new Set<Listener>();
let seq = 0;

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

export function enqueueInAppBanner(item: Omit<InAppBannerItem, "id"> & { id?: string }): void {
  const title = item.title?.trim();
  if (!title) return;
  queue.push({
    id: item.id ?? nextId(),
    title,
    body: item.body ?? null,
    deepLink: item.deepLink ?? null,
    templateCode: item.templateCode ?? null,
    data: item.data,
  });
  pumpQueue();
}

/** Enqueue from a rendered push payload (template title/body already substituted). */
export function enqueueInAppBannerFromPush(payload: PushNotificationOpenPayload): void {
  const data = payload.data ?? {};
  const gmType = typeof data.gmType === "string" ? data.gmType : "";
  // Prep-delay / rich modals have dedicated UI — skip generic banner.
  if (gmType === "ORDER_PREP_DELAY" || gmType === "RICH") return;

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

  enqueueInAppBanner({
    title: title || body || "Update",
    body: title ? body : null,
    deepLink,
    templateCode: typeof data.template_code === "string" ? data.template_code : gmType || null,
    data,
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
  const translateY = useSharedValue(-88);
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
      translateY.value = -88;
      opacity.value = 0;
      return;
    }

    translateY.value = withSpring(0, { damping: 16, stiffness: 220 });
    opacity.value = withTiming(1, { duration: 180 });

    hideTimerRef.current = setTimeout(() => {
      translateY.value = withTiming(-88, { duration: EXIT_MS });
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
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
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
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    maxWidth: "100%",
    ...Platform.select({
      ios: {
        shadowColor: "#0f766e",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#0D9488",
  },
  text: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
