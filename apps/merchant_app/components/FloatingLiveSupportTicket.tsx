import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { useRouter, usePathname, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  TAB_BAR_HEIGHT,
  TAB_BAR_FLOATING_GAP,
  H_PADDING,
  HEADER_HEIGHT,
} from "@/constants/theme";
import { useLiveSupportTicket } from "@/context/LiveSupportTicketContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  isLiveSupportTicketTerminal,
  loadLiveSupportFabPosition,
  saveLiveSupportFabPosition,
  type LiveSupportFabPosition,
} from "@/lib/liveSupportTicketStorage";

const FAB_SIZE = 56;
const DRAG_THRESHOLD = 8;
const REMOVE_ICON_SIZE = 44;

/**
 * Draggable live-support FAB — headset + green dot + unread badge.
 * Drag toward the bottom to reveal a REMOVE drop target.
 * Drop hides the FAB across all pages until the merchant opens a ticket
 * from My Tickets (or otherwise registers live support again).
 */
export function FloatingLiveSupportTicket() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ ticketId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const {
    activeTicket,
    unreadCount,
    refreshActiveTicket,
    fabDismissed,
    dismissLiveSupportFab,
  } = useLiveSupportTicket();

  const [posReady, setPosReady] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const dragOriginX = useSharedValue(0);
  const dragOriginY = useSharedValue(0);
  const isDragging = useSharedValue(0);
  const overRemove = useSharedValue(0);
  const removeZoneProgress = useSharedValue(0);
  const pulse = useSharedValue(0.4);

  const screenWSV = useSharedValue(screenW);
  const screenHSV = useSharedValue(screenH);
  const minBottomSV = useSharedValue(0);
  const minTopSV = useSharedValue(0);
  const removeZoneTopSV = useSharedValue(0);

  const hasTabBar =
    !pathname.startsWith("/order/") && !pathname.includes("/support/chat");
  const minBottom = hasTabBar
    ? TAB_BAR_HEIGHT + TAB_BAR_FLOATING_GAP + insets.bottom + 8
    : insets.bottom + 12;
  const minTop = insets.top + HEADER_HEIGHT;

  const defaultPos = useMemo(
    () => ({
      x: screenW - H_PADDING - FAB_SIZE,
      y: screenH - minBottom - FAB_SIZE,
    }),
    [screenW, screenH, minBottom]
  );

  const clampPos = useCallback(
    (p: LiveSupportFabPosition): LiveSupportFabPosition => ({
      x: Math.max(H_PADDING, Math.min(screenW - H_PADDING - FAB_SIZE, p.x)),
      y: Math.max(minTop, Math.min(screenH - minBottom - FAB_SIZE, p.y)),
    }),
    [screenW, screenH, minBottom, minTop]
  );

  // Keep worklet bounds in sync with layout.
  useEffect(() => {
    screenWSV.value = screenW;
    screenHSV.value = screenH;
    minBottomSV.value = minBottom;
    minTopSV.value = minTop;
    removeZoneTopSV.value = screenH - minBottom - REMOVE_ICON_SIZE - 12;
  }, [
    screenW,
    screenH,
    minBottom,
    minTop,
    screenWSV,
    screenHSV,
    minBottomSV,
    minTopSV,
    removeZoneTopSV,
  ]);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  useEffect(() => {
    let cancelled = false;
    setPosReady(false);
    if (storeId == null) {
      const next = clampPos(defaultPos);
      translateX.value = next.x;
      translateY.value = next.y;
      setPosReady(true);
      return;
    }
    void (async () => {
      const saved = await loadLiveSupportFabPosition(storeId);
      if (cancelled) return;
      const next = clampPos(saved ?? defaultPos);
      translateX.value = next.x;
      translateY.value = next.y;
      setPosReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, defaultPos, clampPos, translateX, translateY]);

  // Re-clamp after rotation / tab-bar chrome changes.
  useEffect(() => {
    if (!posReady) return;
    const next = clampPos({ x: translateX.value, y: translateY.value });
    translateX.value = next.x;
    translateY.value = next.y;
  }, [screenW, screenH, minBottom, minTop, clampPos, posReady, translateX, translateY]);

  const openChat = useCallback(() => {
    if (activeTicket == null) return;
    router.push({
      pathname: "/support/chat/[ticketId]",
      params: { ticketId: String(activeTicket.ticketId) },
    });
  }, [activeTicket, router]);

  const persistPos = useCallback(
    (x: number, y: number) => {
      if (storeId == null) return;
      void saveLiveSupportFabPosition(storeId, { x, y });
    },
    [storeId]
  );

  const dismissFab = useCallback(() => {
    dismissLiveSupportFab();
  }, [dismissLiveSupportFab]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(DRAG_THRESHOLD)
        .onBegin(() => {
          "worklet";
          dragOriginX.value = translateX.value;
          dragOriginY.value = translateY.value;
        })
        .onStart(() => {
          "worklet";
          isDragging.value = 1;
          removeZoneProgress.value = withTiming(1, { duration: 180 });
        })
        .onUpdate((e) => {
          "worklet";
          const rawX = dragOriginX.value + e.translationX;
          const rawY = dragOriginY.value + e.translationY;
          const maxX = screenWSV.value - H_PADDING - FAB_SIZE;
          const dragMaxY = screenHSV.value - minBottomSV.value - FAB_SIZE * 0.25;
          translateX.value = Math.max(H_PADDING, Math.min(maxX, rawX));
          translateY.value = Math.max(minTopSV.value, Math.min(dragMaxY, rawY));

          const fabBottom = translateY.value + FAB_SIZE;
          const fabTop = translateY.value;
          const zoneTop = removeZoneTopSV.value;
          const zoneBottom = screenHSV.value - minBottomSV.value;
          const hit = fabBottom > zoneTop + 8 && fabTop < zoneBottom;
          overRemove.value = hit ? 1 : 0;
        })
        .onEnd(() => {
          "worklet";
          const shouldRemove = overRemove.value === 1;
          isDragging.value = 0;
          overRemove.value = 0;
          removeZoneProgress.value = withTiming(0, { duration: 160 });

          if (shouldRemove) {
            // Hide remove affordance instantly with the FAB (no linger).
            removeZoneProgress.value = 0;
            runOnJS(dismissFab)();
            return;
          }

          const maxX = screenWSV.value - H_PADDING - FAB_SIZE;
          const maxY = screenHSV.value - minBottomSV.value - FAB_SIZE;
          const nextX = Math.max(H_PADDING, Math.min(maxX, translateX.value));
          const nextY = Math.max(minTopSV.value, Math.min(maxY, translateY.value));
          translateX.value = withSpring(nextX, { damping: 18, stiffness: 220 });
          translateY.value = withSpring(nextY, { damping: 18, stiffness: 220 });
          runOnJS(persistPos)(nextX, nextY);
        })
        .onFinalize(() => {
          "worklet";
          if (isDragging.value === 1) {
            isDragging.value = 0;
            overRemove.value = 0;
            removeZoneProgress.value = withTiming(0, { duration: 160 });
          }
        }),
    [
      dismissFab,
      dragOriginX,
      dragOriginY,
      isDragging,
      minBottomSV,
      minTopSV,
      overRemove,
      persistPos,
      removeZoneProgress,
      removeZoneTopSV,
      screenHSV,
      screenWSV,
      translateX,
      translateY,
    ]
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        "worklet";
        runOnJS(openChat)();
      }),
    [openChat]
  );

  const gesture = useMemo(
    () => Gesture.Exclusive(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  const fabStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: isDragging.value ? 1.06 : 1 },
    ],
    opacity: overRemove.value ? 0.85 : 1,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.9 + (pulse.value - 0.4) * (0.3 / 0.6) }],
  }));

  const removeZoneStyle = useAnimatedStyle(() => ({
    opacity: removeZoneProgress.value,
    transform: [
      {
        translateY: (1 - removeZoneProgress.value) * 24,
      },
    ],
  }));

  const removeInnerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: overRemove.value ? 1.12 : 1 }],
  }));

  const removeIconWhiteStyle = useAnimatedStyle(() => ({
    opacity: 1 - overRemove.value,
  }));

  const removeIconRedStyle = useAnimatedStyle(() => ({
    opacity: overRemove.value,
  }));

  const routeTicketId = Array.isArray(params.ticketId)
    ? params.ticketId[0]
    : params.ticketId;
  const onThisTicketChat =
    activeTicket != null &&
    pathname.includes("/support/chat") &&
    (String(routeTicketId) === String(activeTicket.ticketId) || routeTicketId === "new");

  useEffect(() => {
    if (activeTicket == null || isLiveSupportTicketTerminal(activeTicket.status) || onThisTicketChat) {
      return;
    }
    void refreshActiveTicket();
  }, [refreshActiveTicket, activeTicket?.ticketId, activeTicket?.status, onThisTicketChat, pathname]);

  if (
    activeTicket == null ||
    isLiveSupportTicketTerminal(activeTicket.status) ||
    !posReady ||
    fabDismissed ||
    onThisTicketChat
  ) {
    return null;
  }

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <View pointerEvents="box-none" style={styles.overlay} collapsable={false}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.removeZoneWrap,
          {
            bottom: minBottom + 8,
          },
          removeZoneStyle,
        ]}
      >
        <Animated.View style={[styles.removeIconWrap, removeInnerStyle]}>
          <Animated.View style={[styles.removeIconLayer, removeIconWhiteStyle]}>
            <Ionicons name="trash-outline" size={28} color="#FFFFFF" />
          </Animated.View>
          <Animated.View style={[styles.removeIconLayer, styles.removeIconLayerAbsolute, removeIconRedStyle]}>
            <Ionicons name="trash" size={28} color="#EF4444" />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.host, fabStyle]}>
          <View style={styles.btn}>
            <LinearGradient
              colors={["#FF7A45", "#E85D04"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.gradient}
            >
              <View style={styles.iconCircle}>
                <Ionicons name="headset" size={24} color="#E85D04" />
              </View>
              <Animated.View
                style={[styles.liveDot, unreadCount > 0 && styles.liveDotHidden, pulseStyle]}
              />
            </LinearGradient>
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeLabel}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 110,
    elevation: 110,
  },
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 112,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  btn: {
    width: FAB_SIZE,
    height: FAB_SIZE,
  },
  gradient: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  liveDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#22C55E",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  liveDotHidden: {
    opacity: 0,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  removeZoneWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    height: REMOVE_ICON_SIZE,
    zIndex: 111,
    alignItems: "center",
    justifyContent: "center",
  },
  removeIconWrap: {
    width: REMOVE_ICON_SIZE,
    height: REMOVE_ICON_SIZE,
    borderRadius: REMOVE_ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  removeIconLayer: {
    alignItems: "center",
    justifyContent: "center",
  },
  removeIconLayerAbsolute: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
