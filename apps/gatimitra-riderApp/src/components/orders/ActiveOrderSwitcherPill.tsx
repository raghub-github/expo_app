import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";
import { useActiveOrders } from "@/src/hooks/useOrders";
import {
  isActiveRiderOrder,
  openActiveOrder,
} from "@/src/lib/active-order-display";
import { ActiveOrderPickerSheet } from "@/src/components/orders/ActiveOrderPickerSheet";
import { colors } from "@/src/theme";

/** Header height in FoodNavigationMapChrome (ROW_HEIGHT) — keep the pill below it. */
const CHROME_ROW_HEIGHT = 48;

/** ~4 decimal places of lat/lng ≈ 11 m — good enough to call two pickups "the same spot". */
function isSamePickup(a: RiderOrderSummary, b: RiderOrderSummary): boolean {
  const an = a.merchantName?.trim().toLowerCase();
  const bn = b.merchantName?.trim().toLowerCase();
  if (an && bn && an === bn) return true;
  const ap = a.pickup;
  const bp = b.pickup;
  if (!ap || !bp) return false;
  return (
    Math.abs(ap.lat - bp.lat) < 0.0004 && Math.abs(ap.lng - bp.lng) < 0.0004
  );
}

type Props = {
  /** The order currently open on the navigation screen. */
  currentOrder: RiderOrderSummary;
};

/**
 * Floating pill on the active-navigation screen that surfaces the rider's OTHER
 * live order(s) so they can switch without first finishing the current one —
 * e.g. picking up a same-store batch together. Renders nothing when the rider
 * has only this one active order.
 */
export function ActiveOrderSwitcherPill({ currentOrder }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data: active = [] } = useActiveOrders();
  const [sheetOpen, setSheetOpen] = useState(false);

  const others = useMemo(
    () =>
      active.filter(
        (o) => isActiveRiderOrder(o) && o.id !== currentOrder.id
      ),
    [active, currentOrder.id]
  );

  const sameStore = useMemo(
    () => others.some((o) => isSamePickup(currentOrder, o)),
    [others, currentOrder]
  );

  if (others.length === 0) return null;

  const switchTo = (order: RiderOrderSummary) => {
    setSheetOpen(false);
    openActiveOrder(order, { replace: true });
  };

  const handlePress = () => {
    if (others.length === 1) {
      switchTo(others[0]);
      return;
    }
    setSheetOpen(true);
  };

  const label = sameStore
    ? t("orders.switcher.sameStore", "Another order at this pickup")
    : others.length === 1
      ? t("orders.switcher.oneMore", "You have 1 more order")
      : t("orders.switcher.manyMore", "You have {{count}} more orders", {
          count: others.length,
        });

  return (
    <>
      <View
        style={[styles.host, { top: insets.top + CHROME_ROW_HEIGHT + 8 }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          accessibilityRole="button"
          accessibilityLabel={t("orders.switcher.a11y", "Switch to your other order")}
        >
          <View style={styles.iconWrap}>
            <Ionicons
              name={sameStore ? "layers" : "swap-horizontal"}
              size={14}
              color="#fff"
            />
          </View>
          <Text style={styles.pillText} numberOfLines={1}>
            {label}
          </Text>
          <View style={styles.cta}>
            <Text style={styles.ctaText} numberOfLines={1}>
              {t("orders.switcher.switch", "Switch")}
            </Text>
            <Ionicons name="chevron-forward" size={13} color={colors.primary[700]} />
          </View>
        </Pressable>
      </View>

      <ActiveOrderPickerSheet
        visible={sheetOpen}
        orders={others}
        onDismiss={() => setSheetOpen(false)}
        onSelect={switchTo}
      />
    </>
  );
}

const pillShadow = Platform.select({
  ios: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
  },
  android: { elevation: 6 },
  default: {},
});

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 25,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "92%",
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#0F172A",
    ...pillShadow,
  },
  pillPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pillText: {
    flexShrink: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#fff",
    flexShrink: 0,
  },
  ctaText: {
    color: colors.primary[700],
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
