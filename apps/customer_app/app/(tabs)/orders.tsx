/**
 * Orders tab – Order History (Zomato-style reference UI).
 */

import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Share,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { orderService } from "@/services/order.service";
import type { OrderSummary } from "@/services/order.service";
import { addressService } from "@/services/address.service";
import { BrandingFooter } from "@/components/BrandingFooter";
import { DietIndicator } from "@/components/store/DietIndicator";
import { useStoreDeliveryQuote } from "@/hooks/useStoreDeliveryQuote";
import { resolveCheckoutDeliveryAddress } from "@/lib/deliveryDropResolution";
import { useLocationStore } from "@/store/locationStore";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { GatiMitraColors } from "@/constants/gatimitra";
import { populateCartFromOrder, resolveOrderItemDiet } from "@/lib/reorderFromOrder";

const GREEN = GatiMitraColors.primaryMint;
const ERROR = GatiMitraColors.errorRed;
const TITLE_DARK = "#1C1C1C";
const TEXT_GRAY = "#828282";
const CARD_BG = "#FFFFFF";
const BORDER = "#EBEBEB";
const PAGE_BG = "#F5F5F5";
const PAD = 16;

function formatOrderDate(iso: string) {
  try {
    const d = new Date(iso);
    const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const time = d
      .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
      .replace(/\s/g, "");
    return `${day}, ${time}`;
  } catch {
    return iso;
  }
}

function isPaymentFailed(status: string) {
  const s = status.toUpperCase();
  return s === "CANCELLED" || s === "PAYMENT_FAILED" || s === "FAILED";
}

function isDelivered(status: string) {
  return status.toUpperCase() === "DELIVERED";
}

function getStatusLabel(status: string): string {
  if (isPaymentFailed(status)) return "Payment failed";
  if (isDelivered(status)) return "Delivered";
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function toDietType(itemVeg: string | null | undefined): "veg" | "nonveg" | "egg" | null {
  return resolveOrderItemDiet(itemVeg);
}

function getCompactAddressLine(address: string | null | undefined) {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
}

function DashedDivider() {
  return <View style={styles.dashedDivider} />;
}

function OrderCard({
  order,
  onPress,
  onViewMenu,
  onReorder,
  isMenuOpen,
  onToggleMenu,
  onShareRestaurant,
  onOrderDetails,
  onDeleteOrder,
  deliveryAddressId,
  dropCoords,
}: {
  order: OrderSummary;
  onPress: () => void;
  onViewMenu: () => void;
  onReorder: () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onShareRestaurant: () => void;
  onOrderDetails: () => void;
  onDeleteOrder: () => void;
  deliveryAddressId: number | null;
  dropCoords: { latitude: number; longitude: number } | null;
}) {
  const storeId = order.merchantPublicStoreId?.trim() || null;
  const paymentFailed = isPaymentFailed(order.status);
  const delivered = isDelivered(order.status);
  const showActionRow = delivered || paymentFailed;

  const { data: storeQuote } = useStoreDeliveryQuote({
    storeId: storeId ?? "",
    addressId: deliveryAddressId,
    drop:
      deliveryAddressId == null && dropCoords
        ? { lat: dropCoords.latitude, lng: dropCoords.longitude }
        : null,
    enabled: showActionRow && !!storeId && (deliveryAddressId != null || dropCoords != null),
  });

  const canReorder = delivered && !paymentFailed && storeQuote?.serviceable === true;
  const restaurantName = order.merchantPublicName ?? order.merchantName ?? "";
  const merchantArea = getCompactAddressLine(order.merchantAddress);
  const bannerUri = toAbsoluteImageUrl(order.merchantBannerUrl);
  const items = order.items ?? [];
  const primaryItems = items.slice(0, 2);
  const moreCount = Math.max(0, items.length - 2);

  return (
    <View style={styles.orderCard}>
      <View style={styles.orderCardHeader}>
        <View style={styles.orderThumb}>
          {bannerUri ? (
            <Image source={{ uri: bannerUri }} style={styles.orderThumbImage} resizeMode="cover" />
          ) : (
            <View style={styles.orderThumbFallback}>
              <Ionicons name="restaurant-outline" size={22} color="#B0B0B0" />
            </View>
          )}
        </View>

        <View style={styles.orderCardHeadRight}>
          {!!restaurantName && (
            <Text style={styles.orderRestaurantName} numberOfLines={1}>
              {restaurantName}
            </Text>
          )}
          {!!merchantArea && (
            <Text style={styles.orderLocation} numberOfLines={1}>
              {merchantArea}
            </Text>
          )}
          <TouchableOpacity onPress={onViewMenu} style={styles.viewMenuBtn} activeOpacity={0.8}>
            <Text style={styles.viewMenuText}>View menu</Text>
            <Ionicons name="chevron-forward" size={12} color={GREEN} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity hitSlop={12} style={styles.ellipsisBtn} onPress={onToggleMenu}>
          <Ionicons name="ellipsis-vertical" size={18} color="#696969" />
        </TouchableOpacity>

        {isMenuOpen && (
          <View style={styles.moreMenu}>
            <TouchableOpacity style={styles.moreMenuItem} onPress={onShareRestaurant} activeOpacity={0.8}>
              <Ionicons name="share-social-outline" size={18} color="#696969" />
              <Text style={styles.moreMenuText}>Share restaurant</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreMenuItem} onPress={onOrderDetails} activeOpacity={0.8}>
              <Ionicons name="receipt-outline" size={18} color="#696969" />
              <Text style={styles.moreMenuText}>Order details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreMenuItem} onPress={onDeleteOrder} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={18} color="#696969" />
              <Text style={styles.moreMenuText}>Delete this order</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {primaryItems.length > 0 && (
        <>
          <DashedDivider />
          <TouchableOpacity
            style={styles.orderItemsBlock}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View order details"
          >
            {primaryItems.map((item, index) => {
              const diet = toDietType(item.vegNonVeg);
              const subtext = item.customization?.trim() || item.variantName?.trim() || "";
              return (
                <View key={`${order.orderId}-item-${index}`} style={styles.orderLineWrap}>
                  <View style={styles.orderLine}>
                    {diet != null && (
                      <View style={styles.dietWrap}>
                        <DietIndicator type={diet} />
                      </View>
                    )}
                    <View style={styles.orderLineContent}>
                      <Text style={styles.orderLineText} numberOfLines={2}>
                        <Text style={styles.orderQty}>{item.quantity} x </Text>
                        {item.name}
                      </Text>
                      {!!subtext && (
                        <Text style={styles.orderLineSubtext} numberOfLines={2}>
                          {subtext}
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
            {moreCount > 0 && <Text style={styles.moreItemsText}>+{moreCount} more item{moreCount > 1 ? "s" : ""}</Text>}
          </TouchableOpacity>
        </>
      )}

      <DashedDivider />

      <TouchableOpacity style={styles.orderFooter} onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.orderDate}>Order placed on {formatOrderDate(order.createdAt)}</Text>
        <View style={styles.priceRow}>
          {order.totalAmount != null && (
            <Text style={styles.orderPrice}>₹{order.totalAmount.toFixed(2)}</Text>
          )}
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </View>
      </TouchableOpacity>

      {showActionRow && (
        <>
          <DashedDivider />
          <View style={styles.actionRow}>
            <View style={styles.actionLeft}>
              {paymentFailed ? (
                <>
                  <Ionicons name="alert-circle" size={16} color={ERROR} />
                  <Text style={styles.paymentFailedText}>Payment failed</Text>
                </>
              ) : (
                <Text style={styles.deliveredText}>{getStatusLabel(order.status)}</Text>
              )}
            </View>

            {canReorder ? (
              <TouchableOpacity style={styles.reorderBtn} onPress={onReorder} activeOpacity={0.9}>
                <Ionicons name="refresh" size={15} color="#fff" />
                <Text style={styles.reorderText}>Reorder</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.notDeliveringBtn}>
                <Text style={styles.notDeliveringText}>Currently not delivering</Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [openMenuOrderId, setOpenMenuOrderId] = useState<string | null>(null);
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<string>>(new Set());

  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);

  const { data: activeLocation } = useQuery({
    queryKey: ["active-location"],
    queryFn: () => addressService.getActiveLocation(),
    staleTime: 0,
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
  });

  const resolvedDeliveryAddress = useMemo(
    () =>
      resolveCheckoutDeliveryAddress(
        addresses,
        coords,
        locationSource,
        activeLocation
      ),
    [addresses, coords, locationSource, activeLocation]
  );

  const dropCoords = useMemo(() => {
    if (resolvedDeliveryAddress) return null;
    if (coords?.latitude != null && coords?.longitude != null) {
      return { latitude: coords.latitude, longitude: coords.longitude };
    }
    return null;
  }, [resolvedDeliveryAddress, coords?.latitude, coords?.longitude]);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => orderService.getMyOrders({ limit: 50 }),
  });

  const visibleOrders = orders.filter((o) => !hiddenOrderIds.has(o.orderId));
  const filteredOrders = search.trim()
    ? visibleOrders.filter(
        (o) =>
          (o.merchantName?.toLowerCase().includes(search.toLowerCase())) ||
          (o.merchantPublicName?.toLowerCase().includes(search.toLowerCase())) ||
          o.items?.some((i) => i.name.toLowerCase().includes(search.toLowerCase()))
      )
    : visibleOrders;

  const handleShareRestaurant = async (order: OrderSummary) => {
    setOpenMenuOrderId(null);
    try {
      const storeId = order.merchantPublicStoreId ?? order.merchantStoreId?.toString() ?? null;
      const restaurantLink = storeId != null ? `gatimitra://home/merchant/${storeId}` : null;
      const restaurantName = order.merchantPublicName ?? order.merchantName ?? "this restaurant";
      await Share.share({
        message: restaurantLink
          ? `Just discovered ${restaurantName} on GatiMitra — totally worth it!\n\n${restaurantLink}`
          : `Just discovered ${restaurantName} on GatiMitra — totally worth it!`,
        url: restaurantLink ?? undefined,
        title: order.merchantName ?? "Restaurant",
      });
    } catch {
      // User cancelled share sheet.
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    Alert.alert("Delete this order", "Remove this order card from history view?", [
      { text: "Cancel", style: "cancel", onPress: () => setOpenMenuOrderId(null) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setHiddenOrderIds((prev) => new Set(prev).add(orderId));
          setOpenMenuOrderId(null);
        },
      },
    ]);
  };

  const navigateToStore = (order: OrderSummary) => {
    const storeId = order.merchantPublicStoreId ?? order.merchantStoreId?.toString();
    if (storeId) router.push(`/home/merchant/${storeId}`);
  };

  const openOrderDetails = (orderId: string) => {
    void queryClient.prefetchQuery({
      queryKey: ["order", orderId],
      queryFn: () => orderService.getOrder(orderId),
      staleTime: 30_000,
    });
    router.push(`/orders/${orderId}`);
  };

  const handleReorder = useCallback(
    async (order: OrderSummary) => {
      let orderData = order;
      const needsDetail = (order.items ?? []).some((i) => !i.menuItemId?.trim());
      if (needsDetail) {
        try {
          orderData = await orderService.getOrder(order.orderId);
        } catch {
          Alert.alert("Reorder failed", "Could not load order items. Please try again.");
          return;
        }
      }
      const ok = populateCartFromOrder(orderData);
      if (!ok) {
        Alert.alert(
          "Unable to reorder",
          "Items from this order are unavailable. Try viewing the menu instead."
        );
        return;
      }
      router.push("/checkout");
    },
    [router]
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top - 6, 0) }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={22} color={TITLE_DARK} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Your Orders</Text>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={GREEN} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by restaurant or dish"
          placeholderTextColor={TEXT_GRAY}
          value={search}
          onChangeText={setSearch}
        />
        <TouchableOpacity hitSlop={8} style={styles.micBtn}>
          <Ionicons name="mic" size={18} color={GREEN} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="receipt-outline" size={56} color={BORDER} />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySub}>Order from a restaurant to see them here.</Text>
          <TouchableOpacity
            onPress={() => router.push("/home")}
            style={styles.exploreBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.exploreBtnText}>Explore restaurants</Text>
          </TouchableOpacity>
          <BrandingFooter />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={() => setOpenMenuOrderId(null)}
        >
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.orderId}
              order={order}
              onPress={() => openOrderDetails(order.orderId)}
              onViewMenu={() => navigateToStore(order)}
              onReorder={() => handleReorder(order)}
              isMenuOpen={openMenuOrderId === order.orderId}
              onToggleMenu={() =>
                setOpenMenuOrderId((prev) => (prev === order.orderId ? null : order.orderId))
              }
              onShareRestaurant={() => handleShareRestaurant(order)}
              onOrderDetails={() => {
                setOpenMenuOrderId(null);
                openOrderDetails(order.orderId);
              }}
              onDeleteOrder={() => handleDeleteOrder(order.orderId)}
              deliveryAddressId={resolvedDeliveryAddress?.id ?? null}
              dropCoords={dropCoords}
            />
          ))}
          <BrandingFooter />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD,
    paddingBottom: 6,
    backgroundColor: PAGE_BG,
    gap: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pageTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    marginHorizontal: PAD,
    marginBottom: 10,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TITLE_DARK,
    paddingVertical: 8,
  },
  micBtn: { padding: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD, gap: 12 },
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
    backgroundColor: GREEN,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  exploreBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },

  orderCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    borderStyle: "dashed",
    marginHorizontal: 12,
  },
  orderCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  orderThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F0F0F0",
  },
  orderThumbImage: { width: "100%", height: "100%" },
  orderThumbFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  orderCardHeadRight: { flex: 1, marginLeft: 10, paddingRight: 4 },
  orderRestaurantName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    color: TITLE_DARK,
  },
  orderLocation: {
    fontSize: 12,
    color: TEXT_GRAY,
    marginTop: 2,
    lineHeight: 16,
  },
  viewMenuBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    alignSelf: "flex-start",
    gap: 2,
  },
  viewMenuText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
    color: GREEN,
  },
  ellipsisBtn: { paddingTop: 2, paddingHorizontal: 2 },
  moreMenu: {
    position: "absolute",
    top: 36,
    right: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 6,
    minWidth: 180,
    zIndex: 30,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  moreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  moreMenuText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "500",
    color: "#4B5563",
  },
  orderItemsBlock: {
    marginHorizontal: 10,
    marginVertical: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#F8FAF9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8F5EE",
  },
  orderLineWrap: {
    paddingVertical: 2,
  },
  orderLine: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  dietWrap: { marginTop: 3 },
  orderLineContent: { flex: 1 },
  orderLineText: {
    fontSize: 14,
    lineHeight: 19,
    color: TITLE_DARK,
    fontWeight: "500",
  },
  orderQty: {
    fontWeight: "700",
    color: TITLE_DARK,
  },
  orderLineSubtext: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    color: TEXT_GRAY,
  },
  moreItemsText: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    color: GREEN,
    fontWeight: "600",
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  orderDate: {
    fontSize: 12,
    lineHeight: 16,
    color: TEXT_GRAY,
    flex: 1,
    paddingRight: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  orderPrice: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  actionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  paymentFailedText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: ERROR,
  },
  deliveredText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
    color: TEXT_GRAY,
  },
  reorderBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GREEN,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  reorderText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#fff",
  },
  notDeliveringBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#B9BDCA",
    borderRadius: 8,
    maxWidth: "58%",
  },
  notDeliveringText: {
    fontSize: 11,
    lineHeight: 14,
    color: "#FFFFFF",
    fontWeight: "600",
    textAlign: "center",
  },
});
