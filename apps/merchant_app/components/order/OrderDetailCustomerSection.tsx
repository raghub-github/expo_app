/**
 * Order details — Customer details section (light mode, reference layout).
 */

import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ApiFoodOrder } from "@/services/ordersApi";
import { callCustomer } from "@/lib/orderCardActions";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  order: ApiFoodOrder;
};

function customerLocationLine(dropAddress: string | null | undefined): string {
  const raw = (dropAddress ?? "").trim();
  if (!raw) return "";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const statePart = parts[parts.length - 1]!.replace(/\b\d{6}\b/g, "").trim();
    const cityPart = parts[parts.length - 2]!;
    if (cityPart && statePart) return `${cityPart}, ${statePart}`;
    if (cityPart) return cityPart;
  }
  return parts[parts.length - 1] || raw;
}

function ordersWithYouLabel(order: ApiFoodOrder): string | null {
  const total = order.customer_store_orders_total;
  if (total != null && total > 0) {
    return `${total} order${total === 1 ? "" : "s"} with you`;
  }
  const ordinal = order.customer_store_order_ordinal;
  if (ordinal != null && ordinal > 0) {
    return `${ordinal} order${ordinal === 1 ? "" : "s"} with you`;
  }
  return null;
}

export function OrderDetailCustomerSection({ order }: Props) {
  const name = (order.customer_name ?? "").trim() || "Customer";
  const ordersLabel = ordersWithYouLabel(order);
  const fullAddress = (order.drop_address ?? "").trim();
  const location = customerLocationLine(order.drop_address);
  const distance =
    order.distance_km != null && Number.isFinite(Number(order.distance_km))
      ? `${Number(order.distance_km).toFixed(1)} km`
      : null;
  const phone = (order.customer_phone ?? "").trim();
  // Prefer city/state summary when we can parse it; otherwise the loc row still shows something.
  const showLocSummary = Boolean(location || distance);

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Customer details</Text>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={22} color="#9CA3AF" />
          </View>
          <View style={styles.body}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {ordersLabel ? <Text style={styles.sub}>{ordersLabel}</Text> : null}
          </View>
          {phone ? (
            <Pressable
              onPress={() => void callCustomer(order.customer_phone)}
              style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.85 }]}
              accessibilityLabel="Call customer"
            >
              <Ionicons name="call" size={18} color="#FFFFFF" />
            </Pressable>
          ) : null}
        </View>

        {showLocSummary ? (
          <View style={styles.locRow}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text style={styles.locText} numberOfLines={1}>
              {location || "—"}
            </Text>
            {distance ? <Text style={styles.distance}>{distance}</Text> : null}
          </View>
        ) : null}

        {fullAddress ? (
          <View style={[styles.addressBlock, showLocSummary && styles.addressAfterLoc]}>
            {!showLocSummary ? (
              <Ionicons
                name="location-outline"
                size={14}
                color="#6B7280"
                style={styles.addressIcon}
              />
            ) : null}
            <Text style={styles.addressText}>{fullAddress}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
  },
  heading: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  sub: {
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  locRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  locText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  distance: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  addressBlock: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  addressAfterLoc: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  addressIcon: {
    marginTop: 2,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
});
