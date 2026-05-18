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
import { etaService, formatEtaRange, minutesUntil } from "@/services/eta.service";
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

  // Frozen promise + latest live recalc snapshot. Refetched every 60s while
  // the order is active so traffic / rider-pickup events propagate.
  const { data: etaData } = useQuery({
    queryKey: ["orderEta", orderId],
    queryFn: () => etaService.getForOrder(orderId),
    enabled: !!orderId,
    refetchInterval: 60_000,
    staleTime: 30_000,
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

  // ETA priority: live recalc snapshot (most recent server compute) → frozen
  // placement promise → legacy in-cart estimate → status-derived fallback.
  // The live snapshot already accounts for traffic / pickup / weather updates,
  // so when the server has anything for us it's authoritative.
  const liveEtaMins = (() => {
    if (!etaData) return null;
    if (etaData.live?.promisedDeliveryAt) {
      const m = minutesUntil(etaData.live.promisedDeliveryAt);
      if (m != null && m > 0) return m;
    }
    if (etaData.promise?.promisedDeliveryAt) {
      const m = minutesUntil(etaData.promise.promisedDeliveryAt);
      if (m != null && m > 0) return m;
    }
    if (etaData.live) return etaData.live.maxMinutes;
    if (etaData.promise?.maxMinutes != null) return etaData.promise.maxMinutes;
    return null;
  })();
  const etaMinutes =
    liveEtaMins ??
    activeOrderForThis?.etaMinutes ??
    (order?.status === "ON_THE_WAY" || order?.status === "OUT_FOR_DELIVERY"
      ? 15
      : order?.status === "PICKED_UP"
        ? 20
        : 27);
  const promisedDeliveryAtIso =
    etaData?.live?.promisedDeliveryAt || etaData?.promise?.promisedDeliveryAt || null;
  const promisedRangeLabel = etaData
    ? formatEtaRange(
        etaData.live?.minMinutes ?? etaData.promise.minMinutes,
        etaData.live?.maxMinutes ?? etaData.promise.maxMinutes,
      )
    : null;

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

  /**
   * Opens the order-linked ticket flow. Same screen the user can reach from
   * the support hub, but pre-seeded with this order's internal id + GM…
   * reference so the help-topic picker shows status-aware concerns (e.g.
   * "Order not arrived" for an ON_THE_WAY order vs "Damaged item" for
   * DELIVERED). The user can still switch orders inside that flow.
   */
  const handleOpenHelp = () => {
    const orderInternalId = (order as { id?: number | string }).id;
    const orderRef =
      (order as { orderId?: string; order_id?: string }).orderId ??
      (order as { order_id?: string }).order_id ??
      orderId;
    router.push({
      pathname: "/orders/raise-ticket",
      params: {
        orderId: String(orderInternalId ?? ""),
        orderRef: String(orderRef ?? ""),
      },
    });
  };

  const handleViewAllTickets = () => router.push("/support");

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header — back arrow, store name + order id, and a always-visible
            help button so the customer can open the order-linked ticket flow
            from any state of the order. Mirrors Zomato/Swiggy live order UI. */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerIconBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={22} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {order.merchantName ?? "Restaurant"}
            </Text>
            <Text style={styles.orderIdLabel}>#{order.orderId}</Text>
          </View>
          <TouchableOpacity
            onPress={handleOpenHelp}
            style={styles.headerIconBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Get help on this order"
          >
            <Ionicons name="help-circle-outline" size={24} color={GatiMitraColors.emerald} />
          </TouchableOpacity>
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
            {/* ETA pill overlay — live countdown from the server snapshot. */}
            {!isDelivered && !isCancelled && (
              <View style={styles.etaPill}>
                <Ionicons name="time-outline" size={20} color={GatiMitraColors.emerald} />
                <View style={{ marginLeft: 6 }}>
                  <Text style={styles.etaText}>
                    Arriving in ~{etaMinutes} min
                  </Text>
                  {promisedRangeLabel ? (
                    <Text
                      style={{
                        fontSize: 11,
                        color: GatiMitraColors.textSecondary,
                        fontWeight: "500",
                      }}
                    >
                      Promised {promisedRangeLabel}
                      {promisedDeliveryAtIso
                        ? ` · by ${new Date(promisedDeliveryAtIso).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}`
                        : ""}
                    </Text>
                  ) : null}
                </View>
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

          {/* Help & Support — full-featured card with three actions.
              Mirrors the support hub's options so the customer never has to
              leave this page to raise a ticket. Order context is pre-loaded
              into raise-ticket; user can switch orders inside that flow. */}
          <View style={styles.helpCard}>
            <View style={styles.helpHeader}>
              <View style={styles.helpHeaderIcon}>
                <Ionicons name="headset" size={20} color={GatiMitraColors.emerald} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.helpTitle}>Need help?</Text>
                <Text style={styles.helpSubtitle}>
                  Chat with our support team — we&apos;re here 24×7.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.helpActionPrimary}
              onPress={handleOpenHelp}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Raise a ticket for this order"
            >
              <Ionicons name="chatbubbles" size={18} color="#fff" />
              <Text style={styles.helpActionPrimaryText}>Raise ticket for this order</Text>
              <Ionicons name="chevron-forward" size={18} color="#fff" />
            </TouchableOpacity>

            <View style={styles.helpActionRow}>
              <TouchableOpacity
                style={styles.helpActionSecondary}
                onPress={handleViewAllTickets}
                activeOpacity={0.85}
              >
                <Ionicons
                  name="list-circle-outline"
                  size={18}
                  color={GatiMitraColors.emerald}
                />
                <Text style={styles.helpActionSecondaryText}>My tickets</Text>
              </TouchableOpacity>
              {order.rider?.phone ? (
                <TouchableOpacity
                  style={styles.helpActionSecondary}
                  onPress={handleCallRider}
                  activeOpacity={0.85}
                >
                  <Ionicons name="call-outline" size={18} color={GatiMitraColors.emerald} />
                  <Text style={styles.helpActionSecondaryText}>Call rider</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.helpActionSecondary, { opacity: 0.5 }]}>
                  <Ionicons
                    name="time-outline"
                    size={18}
                    color={GatiMitraColors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.helpActionSecondaryText,
                      { color: GatiMitraColors.textSecondary },
                    ]}
                  >
                    Rider not assigned
                  </Text>
                </View>
              )}
            </View>
          </View>
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
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraColors.border,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, paddingHorizontal: 4, justifyContent: "center" },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    letterSpacing: 0.1,
  },
  orderIdLabel: {
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
    marginTop: 1,
    letterSpacing: 0.3,
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
  /** Rich help/support card — mirrors the support hub's actions inline. */
  helpCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...GatiMitraColors.elevationShadow,
  },
  helpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  helpHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  helpSubtitle: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
  helpActionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GatiMitraColors.emerald,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  helpActionPrimaryText: {
    flex: 1,
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  helpActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  helpActionSecondary: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 8,
    backgroundColor: GatiMitraColors.mintSoft,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  helpActionSecondaryText: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.emerald,
  },
});
