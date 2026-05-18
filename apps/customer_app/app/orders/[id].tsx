/**
 * Order tracking – Swiggy/Zomato-style: map, live rider, ETA, timeline, rider card, summary.
 * Syncs active order store; clears when order is DELIVERED/CANCELLED.
 */

import { useEffect, useRef, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import { customerMapProps } from "@/lib/mapViewProps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { orderService } from "@/services/order.service";
import { getRouteCoordinates } from "@/services/directions.service";
import { ORDER_STATUS_LABELS } from "@/constants";
import { useOrderStore } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";

const STATUS_STEPS = [
  { key: "ORDER_PLACED", label: "Order Confirmed" },
  { key: "PREPARING", label: "Preparing Food" },
  { key: "PICKED_UP", label: "Picked by Rider" },
  { key: "ON_THE_WAY", label: "On the Way" },
  { key: "DELIVERED", label: "Delivered" },
].map((s) => ({ key: s.key, label: ORDER_STATUS_LABELS[s.key] ?? s.label }));

const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;
const DELTA = 0.012;

function getMapRegion(
  rider: { latitude: number; longitude: number } | null,
  deliveryLat: number | null,
  deliveryLng: number | null,
  pickupLat: number | null,
  pickupLng: number | null
): Region {
  const points: { lat: number; lng: number }[] = [];
  if (rider) {
    points.push({ lat: rider.latitude, lng: rider.longitude });
  }
  if (deliveryLat != null && deliveryLng != null) {
    points.push({ lat: deliveryLat, lng: deliveryLng });
  }
  if (pickupLat != null && pickupLng != null) {
    points.push({ lat: pickupLat, lng: pickupLng });
  }
  if (points.length === 0) {
    return {
      latitude: DEFAULT_LAT,
      longitude: DEFAULT_LNG,
      latitudeDelta: DELTA,
      longitudeDelta: DELTA,
    };
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latDelta = Math.max((maxLat - minLat) * 1.4, DELTA);
  const lngDelta = Math.max((maxLng - minLng) * 1.4, DELTA);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export default function OrderTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = id ?? "";
  const mapRef = useRef<MapView>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderService.getOrder(orderId),
    enabled: !!orderId,
  });

  const isActive =
    order &&
    order.status !== "DELIVERED" &&
    order.status !== "CANCELLED" &&
    (order.status === "ON_THE_WAY" ||
      order.status === "OUT_FOR_DELIVERY" ||
      order.status === "PICKED_UP");

  const { data: tracking } = useQuery({
    queryKey: ["orderTracking", orderId],
    queryFn: () => orderService.getOrderTracking(orderId),
    enabled: !!orderId && !!isActive,
    refetchInterval: isActive ? 2500 : false,
  });

  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  useEffect(() => {
    if (!orderId || !order) return;
    const pickup = { latitude: pickupLat, longitude: pickupLng };
    const drop = { latitude: deliveryLat, longitude: deliveryLng };
    getRouteCoordinates(pickup, drop).then(setRouteCoordinates);
  }, [orderId, pickupLat, pickupLng, deliveryLat, deliveryLng, order?.orderId]);

  const activeOrderForThis = useOrderStore((s) => s.activeOrders.find((o) => o.orderId === orderId) ?? s.activeOrder?.orderId === orderId ? s.activeOrder : null);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);

  useEffect(() => {
    if (!order) return;
    const status = (order.status ?? "").toUpperCase();
    if (status === "DELIVERED" || status === "CANCELLED") {
      removeActiveOrder(order.orderId);
    } else {
      const eta =
        status === "OUT_FOR_DELIVERY" || status === "ON_THE_WAY"
          ? 15
          : status === "PICKED_UP"
            ? 20
            : 27;
      updateOrderStatus(order.orderId, status as import("@/store/orderStore").OrderStatus, eta);
    }
  }, [order?.status, order?.orderId, updateOrderStatus, removeActiveOrder]);

  const deliveryLat =
    order?.deliveryLat != null ? order.deliveryLat : DEFAULT_LAT + 0.008;
  const deliveryLng =
    order?.deliveryLng != null ? order.deliveryLng : DEFAULT_LNG + 0.008;
  const pickupLat =
    order?.pickupLat != null ? order.pickupLat : DEFAULT_LAT - 0.006;
  const pickupLng =
    order?.pickupLng != null ? order.pickupLng : DEFAULT_LNG - 0.006;

  const mapRegion = useMemo(
    () =>
      getMapRegion(
        tracking?.rider ?? null,
        deliveryLat,
        deliveryLng,
        pickupLat,
        pickupLng
      ),
    [
      tracking?.rider,
      deliveryLat,
      deliveryLng,
      pickupLat,
      pickupLng,
    ]
  );

  const etaMinutes =
    activeOrderForThis?.etaMinutes ??
    (order?.status === "ON_THE_WAY" || order?.status === "OUT_FOR_DELIVERY"
      ? 15
      : order?.status === "PICKED_UP"
        ? 20
        : 27);

  if (!orderId) {
    return (
      <View style={[styles.center, styles.screenBg]}>
        <Text style={styles.errText}>Invalid order</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading || !order) {
    return (
      <View style={[styles.center, styles.screenBg]}>
        <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
        <Text style={styles.loadingText}>Loading order...</Text>
      </View>
    );
  }

  const normalizedStatus = order.status === "OUT_FOR_DELIVERY" ? "ON_THE_WAY" : order.status;
  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === normalizedStatus);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;
  const isDelivered = order.status === "DELIVERED";
  const isCancelled = order.status === "CANCELLED";

  const handleCallRider = () => {
    const phone = order.rider?.phone?.replace(/\D/g, "") ?? "";
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header: restaurant name, order ID */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {order.merchantName ?? "Restaurant"}
            </Text>
            <Text style={styles.orderIdLabel}>#{order.orderId}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Map */}
          <View style={styles.mapWrap}>
            <MapView
              ref={mapRef}
              style={styles.map}
              {...customerMapProps()}
              initialRegion={mapRegion}
              scrollEnabled
              zoomEnabled
              showsUserLocation={false}
              showsMyLocationButton={Platform.OS !== "web"}
            >
              {/* Restaurant / pickup */}
              <Marker
                coordinate={{ latitude: pickupLat, longitude: pickupLng }}
                title={order.merchantName ?? "Restaurant"}
                pinColor={GatiMitraColors.warmOrange}
              />
              {/* Delivery address */}
              <Marker
                coordinate={{ latitude: deliveryLat, longitude: deliveryLng }}
                title="Delivery address"
                pinColor={GatiMitraColors.emerald}
              />
              {/* Blue route polyline (pickup → drop, drivable route) */}
              {routeCoordinates.length >= 2 && (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor="#2563eb"
                  strokeWidth={4}
                  lineCap="round"
                  lineJoin="round"
                />
              )}
              {/* Rider (live) */}
              {tracking?.rider && (
                <Marker
                  coordinate={{
                    latitude: tracking.rider.latitude,
                    longitude: tracking.rider.longitude,
                  }}
                  title="Rider"
                  description="Your order is here"
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.riderMarker}>
                    <Ionicons name="bicycle" size={28} color="#fff" />
                  </View>
                </Marker>
              )}
            </MapView>
            {/* ETA pill overlay */}
            {!isDelivered && !isCancelled && (
              <View style={styles.etaPill}>
                <Ionicons name="time-outline" size={20} color={GatiMitraColors.emerald} />
                <Text style={styles.etaText}>
                  Arriving in ~{etaMinutes} min
                </Text>
              </View>
            )}
            {isDelivered && (
              <View style={[styles.etaPill, styles.deliveredPill]}>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.deliveredText}>Delivered</Text>
              </View>
            )}
          </View>

          {/* Status timeline */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order status</Text>
            {STATUS_STEPS.map((step, i) => (
              <View key={step.key} style={styles.timelineRow}>
                <View style={styles.timelineDotWrap}>
                  <View
                    style={[
                      styles.timelineDot,
                      i <= activeIndex ? styles.timelineDotActive : styles.timelineDotInactive,
                    ]}
                  >
                    {i < activeIndex ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : i === activeIndex ? (
                      <View style={styles.timelineDotCurrent} />
                    ) : null}
                  </View>
                  {i < STATUS_STEPS.length - 1 && (
                    <View
                      style={[
                        styles.timelineLine,
                        i < activeIndex ? styles.timelineLineActive : styles.timelineLineInactive,
                      ]}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.timelineLabel,
                    i <= activeIndex ? styles.timelineLabelActive : styles.timelineLabelInactive,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rider card */}
          {order.rider && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delivery partner</Text>
              <View style={styles.riderRow}>
                <View style={styles.riderAvatar}>
                  <Ionicons name="person" size={24} color={GatiMitraColors.emerald} />
                </View>
                <View style={styles.riderInfo}>
                  <Text style={styles.riderName}>{order.rider.name}</Text>
                  {order.rider.phone && (
                    <TouchableOpacity
                      onPress={handleCallRider}
                      style={styles.callBtn}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={18} color={GatiMitraColors.emerald} />
                      <Text style={styles.callBtnText}>Call</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Delivery address */}
          {order.deliveryAddress && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Delivery address</Text>
              <View style={styles.addressRow}>
                <Ionicons name="location-outline" size={20} color={GatiMitraColors.textSecondary} />
                <Text style={styles.addressText}>{order.deliveryAddress}</Text>
              </View>
              {order.deliveryOtp && !["DELIVERED", "CANCELLED"].includes(order.status) && (
                <View style={styles.otpBox}>
                  <Text style={styles.otpLabel}>Delivery OTP</Text>
                  <Text style={styles.otpCode}>{order.deliveryOtp}</Text>
                  <Text style={styles.otpHint}>Share this code only when you receive the order.</Text>
                </View>
              )}
            </View>
          )}

          {/* Order summary */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Order summary</Text>
            {order.items?.map((item, i) => (
              <View key={i} style={styles.summaryRow}>
                <Text style={styles.summaryItem} numberOfLines={1}>
                  {item.name} × {item.quantity}
                </Text>
                <Text style={styles.summaryPrice}>
                  ₹{Math.round(item.price * item.quantity)}
                </Text>
              </View>
            ))}
            {order.totalAmount != null && (
              <View style={styles.summaryTotal}>
                <Text style={styles.summaryTotalLabel}>Total</Text>
                <Text style={styles.summaryTotalValue}>₹{order.totalAmount}</Text>
              </View>
            )}
          </View>

          {/* Help / Support — opens order-linked raise-ticket flow.
              We pass both the internal numeric id (used by backend joins)
              and the human-readable order ref (used in subject + display). */}
          <TouchableOpacity
            style={styles.helpBtn}
            onPress={() => {
              const orderInternalId = (order as { id?: number | string }).id;
              const orderRef = (order as { orderId?: string; order_id?: string }).orderId
                ?? (order as { order_id?: string }).order_id
                ?? orderId;
              router.push({
                pathname: "/orders/raise-ticket",
                params: {
                  orderId: String(orderInternalId ?? ""),
                  orderRef: String(orderRef ?? ""),
                },
              });
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="help-circle-outline" size={22} color={GatiMitraColors.textSecondary} />
            <Text style={styles.helpBtnText}>Need help with this order?</Text>
            <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
  screenBg: {
    backgroundColor: GatiMitraColors.softBackground,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errText: {
    fontSize: 16,
    color: GatiMitraColors.textSecondary,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 16,
    color: GatiMitraColors.textSecondary,
    marginTop: 12,
  },
  primaryBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  backBtn: { padding: 4 },
  headerCenter: { flex: 1, marginLeft: 8, justifyContent: "center" },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  headerRight: {
    minWidth: 40,
    alignItems: "flex-end",
  },
  orderIdLabel: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  mapWrap: {
    height: 220,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: GatiMitraColors.border,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  riderMarker: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraColors.emerald,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    ...GatiMitraColors.elevationShadow,
  },
  etaPill: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    ...GatiMitraColors.elevationShadow,
  },
  etaText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  deliveredPill: {
    backgroundColor: GatiMitraColors.emerald,
  },
  deliveredText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...GatiMitraColors.elevationShadow,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  timelineDotWrap: {
    width: 24,
    alignItems: "center",
    position: "relative",
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotActive: {
    backgroundColor: GatiMitraColors.emerald,
  },
  timelineDotInactive: {
    backgroundColor: "#E5E7EB",
  },
  timelineDotCurrent: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: GatiMitraColors.emerald,
  },
  timelineLine: {
    position: "absolute",
    left: 11,
    top: 24,
    width: 2,
    height: 22,
  },
  timelineLineActive: {
    backgroundColor: GatiMitraColors.emerald,
  },
  timelineLineInactive: {
    backgroundColor: "#E5E7EB",
  },
  timelineLabel: {
    fontSize: 15,
    marginLeft: 12,
    flex: 1,
    marginTop: 2,
  },
  timelineLabelActive: {
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  timelineLabelInactive: {
    color: GatiMitraColors.textSecondary,
  },
  riderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  riderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  riderInfo: { marginLeft: 12, flex: 1 },
  riderName: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  callBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraColors.emerald,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  addressText: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    flex: 1,
  },
  otpBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.emerald + "14",
    borderWidth: 1,
    borderColor: GatiMitraColors.emerald + "40",
  },
  otpLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.emerald,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  otpCode: {
    fontSize: 28,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    letterSpacing: 6,
    marginTop: 4,
  },
  otpHint: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryItem: {
    fontSize: 14,
    color: GatiMitraColors.textPrimary,
    flex: 1,
  },
  summaryPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  summaryTotal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
  },
  helpBtnText: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
  },
});
