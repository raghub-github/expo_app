import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import { useRouter, usePathname, useGlobalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
const DRAG_THRESHOLD = 6;

/**
 * Draggable live-support FAB — headset + green dot + unread badge.
 */
export function FloatingLiveSupportTicket() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ ticketId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { activeTicket, unreadCount, refreshActiveTicket } = useLiveSupportTicket();

  const pulse = useRef(new Animated.Value(0.4)).current;
  const posRef = useRef<LiveSupportFabPosition>({ x: 0, y: 0 });
  const dragRef = useRef({ moved: false, originX: 0, originY: 0 });
  const [pos, setPos] = useState<LiveSupportFabPosition | null>(null);

  const hasTabBar =
    !pathname.startsWith("/order/") && !pathname.includes("/support/chat");
  const minBottom = hasTabBar
    ? TAB_BAR_HEIGHT + TAB_BAR_FLOATING_GAP + insets.bottom + 8
    : insets.bottom + 12;

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
      y: Math.max(
        insets.top + HEADER_HEIGHT,
        Math.min(screenH - minBottom - FAB_SIZE, p.y)
      ),
    }),
    [screenW, screenH, minBottom, insets.top]
  );

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    let cancelled = false;
    if (storeId == null) {
      const next = clampPos(defaultPos);
      posRef.current = next;
      setPos(next);
      return;
    }
    void (async () => {
      const saved = await loadLiveSupportFabPosition(storeId);
      if (cancelled) return;
      const next = clampPos(saved ?? defaultPos);
      posRef.current = next;
      setPos(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, defaultPos, clampPos]);

  useEffect(() => {
    if (pos == null) return;
    const next = clampPos(pos);
    if (next.x !== pos.x || next.y !== pos.y) {
      posRef.current = next;
      setPos(next);
    }
  }, [screenW, screenH, minBottom, clampPos, pos]);

  const openChat = useCallback(() => {
    if (activeTicket == null) return;
    router.push({
      pathname: "/support/chat/[ticketId]",
      params: { ticketId: String(activeTicket.ticketId) },
    });
  }, [activeTicket, router]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD,
        onPanResponderGrant: () => {
          dragRef.current = {
            moved: false,
            originX: posRef.current.x,
            originY: posRef.current.y,
          };
        },
        onPanResponderMove: (_, g) => {
          if (Math.abs(g.dx) > DRAG_THRESHOLD || Math.abs(g.dy) > DRAG_THRESHOLD) {
            dragRef.current.moved = true;
          }
          const next = clampPos({
            x: dragRef.current.originX + g.dx,
            y: dragRef.current.originY + g.dy,
          });
          posRef.current = next;
          setPos(next);
        },
        onPanResponderRelease: () => {
          if (!dragRef.current.moved) {
            openChat();
            return;
          }
          if (storeId != null) {
            void saveLiveSupportFabPosition(storeId, posRef.current);
          }
        },
        onPanResponderTerminate: () => {
          if (storeId != null && dragRef.current.moved) {
            void saveLiveSupportFabPosition(storeId, posRef.current);
          }
        },
      }),
    [clampPos, openChat, storeId]
  );

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

  if (activeTicket == null || isLiveSupportTicketTerminal(activeTicket.status) || pos == null) {
    return null;
  }

  if (onThisTicketChat) return null;

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { left: pos.x, top: pos.y }]}
      {...panResponder.panHandlers}
    >
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
            style={[
              styles.liveDot,
              unreadCount > 0 && styles.liveDotHidden,
              {
                opacity: pulse,
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0.4, 1],
                      outputRange: [0.9, 1.2],
                    }),
                  },
                ],
              },
            ]}
          />
        </LinearGradient>
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    zIndex: 110,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 10 },
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
});
