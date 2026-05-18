import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { useRouter, useSegments } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  GatiMitraMerchant,
  TAB_BAR_HEIGHT,
  TAB_BAR_FLOATING_GAP,
  H_PADDING,
} from "@/constants/theme";
import { useOrders } from "@/hooks/useOrders";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useActiveTab } from "@/context/ActiveTabContext";

/**
 * In-app floating pill for new (CREATED) orders — mirrors partnersite PartnerPendingNewOrdersBar.
 * Respects store setting show_floating_orders (default on).
 */
export function FloatingPendingOrdersBar() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { orders } = useOrders();
  const { settings } = useStoreSettings();
  const { activeTab } = useActiveTab();

  const pending = useMemo(
    () => orders.filter((o) => o.status === "created").length,
    [orders]
  );

  const onOrdersTab = activeTab === "orders" || segments.includes("orders");
  const show =
    settings.show_floating_orders && pending > 0 && !onOrdersTab;

  if (!show) return null;

  const label =
    pending === 1
      ? "1 new order — tap to accept"
      : `${pending} new orders — tap to accept`;

  const bottom =
    TAB_BAR_HEIGHT + TAB_BAR_FLOATING_GAP + insets.bottom + 12;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { bottom }]}
    >
      <Pressable
        onPress={() => router.push("/(tabs)/orders?tab=created")}
        style={({ pressed }) => [
          styles.pill,
          pressed && styles.pillPressed,
          GatiMitraMerchant.cursorPointer,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={22} color={GatiMitraMerchant.primary} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {pending > 99 ? "99+" : pending}
            </Text>
          </View>
        </View>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        <Ionicons
          name="chevron-up"
          size={20}
          color="#FFFFFF"
          style={styles.chevron}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    maxWidth: 420,
    width: "100%",
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
  },
  pillPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    lineHeight: 18,
  },
  chevron: { opacity: 0.9 },
});
