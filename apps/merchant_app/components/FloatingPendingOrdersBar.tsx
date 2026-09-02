import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Platform,
  PanResponder,
  useWindowDimensions,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import {
  GatiMitraMerchant,
  TAB_BAR_HEIGHT,
  TAB_BAR_FLOATING_GAP,
  H_PADDING,
  HEADER_HEIGHT,
} from "@/constants/theme";
import { useOrders } from "@/hooks/useOrders";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useIncomingOrderSheetOptional } from "@/context/IncomingOrderSheetContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { usePathname } from "expo-router";

const FAB_SIZE = 56;
const DRAG_THRESHOLD = 6;
const POS_KEY_PREFIX = "merchant_pending_orders_fab_pos_v1_";

type FabPos = { x: number; y: number };

async function loadFabPos(storeId: number | null): Promise<FabPos | null> {
  if (storeId == null) return null;
  try {
    const raw = await SecureStore.getItemAsync(`${POS_KEY_PREFIX}${storeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FabPos;
    if (!Number.isFinite(parsed?.x) || !Number.isFinite(parsed?.y)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveFabPos(storeId: number | null, pos: FabPos): Promise<void> {
  if (storeId == null) return;
  try {
    await SecureStore.setItemAsync(`${POS_KEY_PREFIX}${storeId}`, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

/**
 * Draggable notification FAB for pending CREATED orders.
 * Tap → reopen incoming accept sheet. Drag anywhere on screen to reposition (persisted per store).
 */
export function FloatingPendingOrdersBar() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { orders } = useOrders();
  const { settings } = useStoreSettings();
  const sheet = useIncomingOrderSheetOptional();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const pathname = usePathname();
  const hideOnPackagingTips = (pathname ?? "").includes("packaging-tips");

  const pending = useMemo(
    () => orders.filter((o) => o.status === "created").length,
    [orders]
  );

  const sheetOpen = sheet?.sheetOpen === true;
  /** One pending order uses the full incoming sheet only — bell is for a multi-order queue. */
  const show =
    settings.show_floating_orders && pending > 1 && !sheetOpen && !hideOnPackagingTips;

  const minBottom = TAB_BAR_HEIGHT + TAB_BAR_FLOATING_GAP + insets.bottom + 8;
  const defaultPos = useMemo(
    () => ({
      x: screenW - H_PADDING - FAB_SIZE,
      y: screenH - minBottom - FAB_SIZE - 64,
    }),
    [screenW, screenH, minBottom]
  );

  const clampPos = useCallback(
    (p: FabPos): FabPos => ({
      x: Math.max(H_PADDING, Math.min(screenW - H_PADDING - FAB_SIZE, p.x)),
      y: Math.max(
        insets.top + HEADER_HEIGHT * 0.35,
        Math.min(screenH - minBottom - FAB_SIZE, p.y)
      ),
    }),
    [screenW, screenH, minBottom, insets.top]
  );

  const posRef = useRef<FabPos>(defaultPos);
  const dragRef = useRef({ moved: false, originX: 0, originY: 0 });
  const [pos, setPos] = useState<FabPos | null>(null);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadFabPos(storeId);
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

  const openIncoming = useCallback(() => {
    sheet?.reopenParkedIncomingOrders();
  }, [sheet]);

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
          Animated.spring(scale, {
            toValue: 1.08,
            useNativeDriver: true,
            friction: 6,
          }).start();
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
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
          }).start();
          if (!dragRef.current.moved) {
            openIncoming();
            return;
          }
          void saveFabPos(storeId, posRef.current);
        },
        onPanResponderTerminate: () => {
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
          }).start();
          if (dragRef.current.moved) {
            void saveFabPos(storeId, posRef.current);
          }
        },
      }),
    [clampPos, openIncoming, scale, storeId]
  );

  if (!show || pos == null) return null;

  const label =
    pending === 1
      ? "1 new order — tap to accept"
      : `${pending} new orders — tap to accept`;

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.fab,
        {
          left: pos.x,
          top: pos.y,
          transform: [{ scale }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.iconInner}>
        <Ionicons name="notifications" size={26} color={GatiMitraMerchant.primary} />
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{pending > 99 ? "99+" : pending}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  iconInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
