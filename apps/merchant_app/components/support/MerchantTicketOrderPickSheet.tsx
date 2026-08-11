import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { fetchFoodOrders, type ApiFoodOrder } from "@/services/ordersApi";
import { formatMerchantOrderPickSubtitle } from "@/lib/formatOrderPickRow";

const PAGE_SIZE = 5;

type Props = {
  visible: boolean;
  storeId: number | null;
  token: string | null;
  onClose: () => void;
  onSelectOrder: (order: ApiFoodOrder) => void;
};

export function MerchantTicketOrderPickSheet({
  visible,
  storeId,
  token,
  onClose,
  onSelectOrder,
}: Props) {
  const [orders, setOrders] = useState<ApiFoodOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const loadOrders = useCallback(async () => {
    if (!storeId || !token) {
      setError("Select a store first.");
      setOrders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchFoodOrders(storeId, token, { limit: 50 });
      setOrders(rows);
      if (rows.length === 0) {
        setError("No recent orders found for this store.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    if (!visible) return;
    setSearch("");
    setVisibleCount(PAGE_SIZE);
    void loadOrders();
  }, [visible, loadOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const label = (order.formatted_order_id ?? String(order.orders_core_id)).toLowerCase();
      const customer = (order.customer_name ?? "").toLowerCase();
      const status = (order.order_status ?? "").toLowerCase();
      const items = formatMerchantOrderPickSubtitle(order).toLowerCase();
      return (
        label.includes(q) ||
        customer.includes(q) ||
        status.includes(q) ||
        items.includes(q)
      );
    });
  }, [orders, search]);

  const visibleRows = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );
  const hasMore = filtered.length > visibleCount;

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightPercent="78%"
      hideCloseFab
    >
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerText}>
          <Text variant="brand" style={styles.title}>
            Select order
          </Text>
          <Text style={styles.subtitle}>Choose the order this ticket is about.</Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={22} color={GatiMitraMerchant.textTertiary} />
        </Pressable>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={GatiMitraMerchant.textTertiary} />
        <TextInput
          value={search}
          onChangeText={(v) => {
            setSearch(v);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="Search by order ID, customer, or status"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          style={styles.searchInput}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void loadOrders()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : visibleRows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No orders match your search.</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {visibleRows.map((order) => {
            const label =
              order.formatted_order_id?.trim() || `#${order.orders_core_id}`;
            const subtitle = formatMerchantOrderPickSubtitle(order);
            return (
              <Pressable
                key={`${order.orders_core_id}-${order.orders_food_id}`}
                onPress={() => onSelectOrder(order)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.orderId}>{label}</Text>
                  {subtitle ? (
                    <Text style={styles.orderMeta} numberOfLines={2}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={GatiMitraMerchant.textTertiary}
                />
              </Pressable>
            );
          })}
          {hasMore ? (
            <Pressable
              onPress={() => setVisibleCount((n) => n + PAGE_SIZE)}
              style={styles.loadMore}
            >
              <Text style={styles.loadMoreText}>View past orders</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { paddingTop: 2 },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 17,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: H_PADDING,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    padding: 0,
  },
  list: { maxHeight: 360, paddingHorizontal: H_PADDING },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  rowPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  rowText: { flex: 1, minWidth: 0 },
  orderId: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  orderMeta: {
    marginTop: 3,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 15,
  },
  center: { paddingVertical: 28, alignItems: "center", gap: 10 },
  errorText: { fontSize: 13, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  emptyText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  retryText: { fontSize: 13, fontWeight: "600", color: "#fff" },
  loadMore: { alignItems: "center", paddingVertical: 12 },
  loadMoreText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
});
