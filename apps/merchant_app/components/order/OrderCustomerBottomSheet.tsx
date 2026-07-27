import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord } from "@/hooks/useOrders";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import {
  formatCustomerOrderOrdinalShort,
  formatOrderCardCustomerLabel,
} from "@/components/order/orderFormatters";
import { callCustomer } from "@/lib/orderCardActions";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

type Props = {
  visible: boolean;
  order: OrderRecord | null;
  onClose: () => void;
};

function StatCard({
  title,
  value,
  subtitle,
  tone,
}: {
  title: string;
  value: string;
  subtitle?: string | null;
  tone: "blue" | "violet";
}) {
  const isBlue = tone === "blue";
  return (
    <View
      style={[
        styles.statCard,
        isBlue ? styles.statCardBlue : styles.statCardViolet,
      ]}
    >
      <Text style={[styles.statTitle, isBlue ? styles.statTitleBlue : styles.statTitleViolet]}>
        {title}
      </Text>
      <Text style={styles.statValue}>{value}</Text>
      {subtitle ? <Text style={styles.statSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function OrderCustomerBottomSheet({ visible, order, onClose }: Props) {
  if (!order) return null;

  const customerName = order.customerName?.trim() || "Customer";
  const storeOrdinal = formatCustomerOrderOrdinalShort(order.customerStoreOrderOrdinal);
  const platformTotal = order.customerPlatformOrdersTotal;
  const storeTotal = order.customerStoreOrdersTotal;

  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose}>
      <View style={styles.header}>
        <Text style={styles.title}>Customer details</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={34} color="#9CA3AF" />
          </View>
          <Text style={styles.name}>{customerName}</Text>
          <Text style={styles.subtitle}>
            {formatOrderCardCustomerLabel(
              customerName,
              order.customerStoreOrderOrdinal
            )}
          </Text>
        </View>

        {order.customerPhone ? (
          <Pressable
            onPress={() => void callCustomer(order.customerPhone)}
            style={({ pressed }) => [styles.phoneRow, pressed && styles.pressed]}
          >
            <Ionicons name="call-outline" size={18} color="#2563EB" />
            <Text style={styles.phone}>{order.customerPhone}</Text>
          </Pressable>
        ) : null}

        <View style={styles.stats}>
          {platformTotal != null && platformTotal > 0 ? (
            <StatCard
              tone="violet"
              title="On GatiMitra"
              value={`Total orders on GatiMitra — ${platformTotal}`}
              subtitle={`${platformTotal} total order${platformTotal === 1 ? "" : "s"} on the platform`}
            />
          ) : null}

          {storeOrdinal ? (
            <StatCard
              tone="blue"
              title="At your store"
              value={`Order from this store — ${storeOrdinal}`}
              subtitle={
                storeTotal != null && storeTotal > 0
                  ? `${storeTotal} total order${storeTotal === 1 ? "" : "s"} with you on GatiMitra`
                  : null
              }
            />
          ) : null}
        </View>

        {order.dropAddress ? (
          <Text style={styles.address} numberOfLines={3}>
            {order.dropAddress}
          </Text>
        ) : null}
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  avatarWrap: {
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  phone: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2563EB",
  },
  stats: {
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statCardBlue: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
  },
  statCardViolet: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  statTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statTitleBlue: { color: "#1D4ED8" },
  statTitleViolet: { color: "#6D28D9" },
  statValue: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  statSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 17,
  },
  address: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  pressed: { opacity: 0.85 },
});
