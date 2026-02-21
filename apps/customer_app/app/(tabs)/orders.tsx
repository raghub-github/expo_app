/**
 * Orders tab – Order History, GatiMitra brand.
 * Header: location, wallet, profile; search; card-based order list with status.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { orderService } from "@/services/order.service";
import type { OrderSummary } from "@/services/order.service";
import { useLocationStore } from "@/store/locationStore";

const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const CARD_BG = "#FFFFFF";
const BORDER = "#E8E8E8";
const PAD = 16;
const SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
};

function formatOrderDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getOrderStatusDisplay(status: string): { text: string; isError?: boolean } {
  if (status === "CANCELLED" || status === "PAYMENT_FAILED") {
    return { text: "Payment failed", isError: true };
  }
  if (status === "DELIVERED") return { text: "Delivered", isError: false };
  return { text: status.replace(/_/g, " ") || "Order placed", isError: false };
}

function getFirstLineItem(order: OrderSummary): string {
  const items = order.items;
  if (items?.length) {
    const first = items[0];
    return `${first.quantity} x ${first.name}`;
  }
  return "Order items";
}

function OrderCard({
  order,
  onPress,
  onViewMenu,
}: {
  order: OrderSummary;
  onPress: () => void;
  onViewMenu: () => void;
}) {
  const statusDisplay = getOrderStatusDisplay(order.status);
  const line1 = getFirstLineItem(order);
  const { address } = useLocationStore();
  const location = address?.primary ?? address?.secondary ?? "Current location";

  return (
    <View style={[styles.orderCard, SHADOW]}>
      <View style={styles.orderCardHeader}>
        <View style={styles.orderThumb} />
        <View style={styles.orderCardHeadRight}>
          <Text style={styles.orderRestaurantName} numberOfLines={1}>
            {order.merchantName ?? `Order #${order.orderId.slice(-6)}`}
          </Text>
          <Text style={styles.orderLocation} numberOfLines={1}>
            {location}
          </Text>
          <TouchableOpacity onPress={onViewMenu} style={styles.viewMenuBtn}>
            <Text style={styles.viewMenuText}>View menu</Text>
            <Ionicons name="chevron-forward" size={14} color={TEAL} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity hitSlop={12} style={styles.ellipsisBtn}>
          <Ionicons name="ellipsis-vertical" size={20} color={TEXT_GRAY} />
        </TouchableOpacity>
      </View>

      <View style={styles.orderLine}>
        <Ionicons name="warning" size={16} color="#f59e0b" style={styles.orderLineIcon} />
        <Text style={styles.orderLineText} numberOfLines={2}>{line1}</Text>
      </View>

      <View style={styles.orderFooter}>
        <View>
          <Text style={styles.orderDate}>Order placed on {formatOrderDate(order.createdAt)}</Text>
          {order.status === "DELIVERED" && (
            <Text style={styles.deliveredText}>Delivered</Text>
          )}
        </View>
        <TouchableOpacity onPress={onPress} style={styles.priceRow}>
          <Text style={styles.orderPrice}>
            ₹{order.totalAmount != null ? order.totalAmount.toFixed(2) : "—"}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={TEXT_GRAY} />
        </TouchableOpacity>
      </View>

      {statusDisplay.isError && (
        <View style={styles.statusRow}>
          <Ionicons name="alert-circle" size={18} color="#dc2626" />
          <Text style={styles.statusErrorText}>{statusDisplay.text}</Text>
        </View>
      )}

      <View style={styles.actionRow}>
        <View style={styles.notDeliveringBtn}>
          <Text style={styles.notDeliveringText}>Currently not delivering</Text>
        </View>
      </View>
    </View>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const { address } = useLocationStore();
  const ordersLocationPrimary = address?.primary ?? "Current location";
  const ordersLocationSub = address?.secondary ?? "Turn on location";

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => orderService.getMyOrders({ limit: 50 }),
  });

  const filteredOrders = search.trim()
    ? orders.filter(
        (o) =>
          (o.merchantName?.toLowerCase().includes(search.toLowerCase())) ||
          o.items?.some((i) => i.name.toLowerCase().includes(search.toLowerCase()))
      )
    : orders;

  return (
    <View style={styles.container}>
      {/* Header: location + wallet + profile */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.locationWrap}
          onPress={() => router.push("/location")}
          activeOpacity={0.8}
        >
          <Ionicons name="location" size={20} color={TEAL} />
          <View>
            <Text style={styles.locationTitle} numberOfLines={1}>{ordersLocationPrimary}</Text>
            <Text style={styles.locationSub} numberOfLines={1}>{ordersLocationSub}</Text>
          </View>
          <Ionicons name="chevron-down" size={16} color={TEXT_GRAY} />
        </TouchableOpacity>
        <View style={styles.headerIcons}>
          <TouchableOpacity
            onPress={() => router.push("/wallet")}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Ionicons name="wallet-outline" size={22} color={TITLE_DARK} />
            <Text style={styles.walletLabel}>₹</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/profile")}
            style={styles.avatarSmall}
            hitSlop={8}
          >
            <Text style={styles.avatarEmoji}>👤</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={20} color={TEAL} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by restaurant or dish..."
          placeholderTextColor={TEXT_GRAY}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity hitSlop={8} style={styles.micBtn}>
          <Ionicons name="mic-outline" size={22} color={TEAL} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="receipt-outline" size={56} color={BORDER} />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>Order from a restaurant to see them here.</Text>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)/")}
            style={styles.exploreBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.exploreBtnText}>Explore restaurants</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onPress={() => router.push({ pathname: "/orders/[id]", params: { id: order.orderId } })}
              onViewMenu={() => router.push("/(tabs)/")}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    paddingVertical: 12,
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  locationWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationTitle: { fontSize: 16, fontWeight: "700", color: TITLE_DARK },
  locationSub: { fontSize: 12, color: TEXT_GRAY },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: 16 },
  iconBtn: { flexDirection: "row", alignItems: "center" },
  walletLabel: { fontSize: 12, color: TITLE_DARK, marginLeft: 2 },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E0F2F1",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 18 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    marginHorizontal: PAD,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 0,
  },
  micBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD, paddingTop: 16 },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingText: { marginTop: 12, fontSize: 15, color: TEXT_GRAY },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK, marginTop: 12 },
  emptySub: { fontSize: 14, color: TEXT_GRAY, marginTop: 8, textAlign: "center" },
  exploreBtn: {
    marginTop: 24,
    backgroundColor: TEAL,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  exploreBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

  orderCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    overflow: "hidden",
  },
  orderCardHeader: { flexDirection: "row", alignItems: "flex-start" },
  orderThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#E0F2F1",
  },
  orderCardHeadRight: { flex: 1, marginLeft: 12 },
  orderRestaurantName: { fontSize: 16, fontWeight: "700", color: TITLE_DARK },
  orderLocation: { fontSize: 13, color: TEXT_GRAY, marginTop: 2 },
  viewMenuBtn: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  viewMenuText: { fontSize: 13, fontWeight: "600", color: TEAL },
  ellipsisBtn: { padding: 4 },
  orderLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  orderLineIcon: { marginRight: 8 },
  orderLineText: { flex: 1, fontSize: 14, color: TITLE_DARK },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  orderDate: { fontSize: 12, color: TEXT_GRAY },
  deliveredText: { fontSize: 14, fontWeight: "600", color: TITLE_DARK, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  orderPrice: { fontSize: 15, fontWeight: "700", color: TITLE_DARK },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  statusErrorText: { fontSize: 14, fontWeight: "600", color: "#dc2626" },
  actionRow: { marginTop: 12 },
  notDeliveringBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#F0F0F0",
    borderRadius: 10,
  },
  notDeliveringText: { fontSize: 13, color: TEXT_GRAY },
});
