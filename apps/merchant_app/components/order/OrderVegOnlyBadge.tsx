/**
 * Zomato-style "VEG ONLY" pill — shown when the order has no non-veg / egg lines.
 */

import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import type { OrderRecord } from "@/hooks/useOrders";
import { isOrderVegOnly } from "@/lib/orderItemVeg";

export function orderHasVegOnlyTag(order: OrderRecord): boolean {
  return isOrderVegOnly(
    order.lineItems.map((it) => ({ name: it.name, vegNonveg: it.vegNonveg })),
    order.vegNonVeg
  );
}

export function OrderVegOnlyBadge() {
  return (
    <View style={styles.badge} accessibilityLabel="Veg only order">
      <Ionicons name="leaf" size={11} color="#166534" />
      <Text style={styles.text}>VEG ONLY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  text: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    color: "#166534",
  },
});
