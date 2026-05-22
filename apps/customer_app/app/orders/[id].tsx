/**
 * Order Details – delivered / cancelled / live tracking (reference UI + GatiMitra green).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  InteractionManager,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, Polyline, Region } from "react-native-maps";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { customerMapProps } from "@/lib/mapViewProps";
import { orderService } from "@/services/order.service";
import { etaService, minutesUntil } from "@/services/eta.service";
import { getRouteCoordinates } from "@/services/directions.service";
import { useOrderStore } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { DietIndicator } from "@/components/store/DietIndicator";
import { parseOrderBillFromSnapshot } from "@/lib/orderBillBreakdown";
import { getOrderDetailInitialData } from "@/lib/orderDetailCache";
import { resolveOrderItemDiet } from "@/lib/reorderFromOrder";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

const GREEN = GatiMitraColors.primaryMint;
const LINK_BLUE = "#2563EB";
const PAGE_BG = "#F5F5F5";
const CARD = "#FFFFFF";
const BORDER = "#EBEBEB";
const TEXT = "#1C1C1C";
const MUTED = "#828282";

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
  if (rider) points.push({ lat: rider.latitude, lng: rider.longitude });
  if (deliveryLat != null && deliveryLng != null) points.push({ lat: deliveryLat, lng: deliveryLng });
  if (pickupLat != null && pickupLng != null) points.push({ lat: pickupLat, lng: pickupLng });
  if (points.length === 0) {
    return { latitude: DEFAULT_LAT, longitude: DEFAULT_LNG, latitudeDelta: DELTA, longitudeDelta: DELTA };
  }
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, DELTA),
  };
}

function getCompactAddressLine(address: string | null | undefined) {
  const raw = (address ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  return raw;
}

function toDietType(itemVeg: string | null | undefined): "veg" | "nonveg" | "egg" | null {
  return resolveOrderItemDiet(itemVeg);
}

function maskPhone(phone: string | undefined | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 2)}XXXX`;
  return `${digits.slice(0, 6)}XXXX`;
}

function formatPaymentDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatMoney(value: number) {
  return `₹${value.toFixed(2)}`;
}

function getStatusBannerText(status: string, paymentStatus?: string | null) {
  const s = status.toUpperCase();
  if (s === "CANCELLED") return "Order was cancelled";
  if (s === "PAYMENT_FAILED" || s === "FAILED" || paymentStatus?.toLowerCase() === "failed") {
    return "Payment failed";
  }
  if (s === "DELIVERED") return "Order was delivered";
  if (s === "ON_THE_WAY" || s === "OUT_FOR_DELIVERY") return "Order is on the way";
  if (s === "PICKED_UP") return "Order picked up";
  if (s === "PREPARING") return "Restaurant is preparing your order";
  return "Order in progress";
}

export default function OrderDetailsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = id ?? "";
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderService.getOrder(orderId),
    enabled: !!orderId,
    initialData: () => getOrderDetailInitialData(queryClient, orderId),
    staleTime: 30_000,
  });

  const isInProgress =
    !!order &&
    order.status !== "DELIVERED" &&
    order.status !== "CANCELLED" &&
    order.status !== "PAYMENT_FAILED" &&
    order.status !== "FAILED";

  useEffect(() => {
    if (!isInProgress) {
      setMapReady(false);
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => setMapReady(true));
    return () => task.cancel();
  }, [isInProgress, orderId]);

  const { data: etaData } = useQuery({
    queryKey: ["orderEta", orderId],
    queryFn: () => etaService.getForOrder(orderId),
    enabled: !!orderId && !!isInProgress,
    refetchInterval: isInProgress ? 60_000 : false,
    staleTime: 30_000,
  });

  const { data: tracking } = useQuery({
    queryKey: ["orderTracking", orderId],
    queryFn: () => orderService.getOrderTracking(orderId),
    enabled: !!orderId && !!isInProgress,
    refetchInterval: isInProgress ? 2500 : false,
  });

  const deliveryLat = order?.deliveryLat != null ? order.deliveryLat : DEFAULT_LAT + 0.008;
  const deliveryLng = order?.deliveryLng != null ? order.deliveryLng : DEFAULT_LNG + 0.008;
  const pickupLat = order?.pickupLat != null ? order.pickupLat : DEFAULT_LAT - 0.006;
  const pickupLng = order?.pickupLng != null ? order.pickupLng : DEFAULT_LNG - 0.006;

  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);
  useEffect(() => {
    if (!orderId || !order || !mapReady) return;
    getRouteCoordinates(
      { latitude: pickupLat, longitude: pickupLng },
      { latitude: deliveryLat, longitude: deliveryLng }
    ).then(setRouteCoordinates);
  }, [orderId, pickupLat, pickupLng, deliveryLat, deliveryLng, order?.orderId, mapReady]);

  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);

  useEffect(() => {
    if (!order) return;
    const status = (order.status ?? "").toUpperCase();
    if (status === "DELIVERED" || status === "CANCELLED") {
      removeActiveOrder(order.orderId);
    } else {
      updateOrderStatus(order.orderId, status as import("@/store/orderStore").OrderStatus, 20);
    }
  }, [order?.status, order?.orderId, updateOrderStatus, removeActiveOrder]);

  const mapRegion = useMemo(
    () =>
      getMapRegion(tracking?.rider ?? null, deliveryLat, deliveryLng, pickupLat, pickupLng),
    [tracking?.rider, deliveryLat, deliveryLng, pickupLat, pickupLng]
  );

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
    return etaData.live?.maxMinutes ?? etaData.promise?.maxMinutes ?? null;
  })();

  const handleOpenHelp = () => {
    router.push({
      pathname: "/orders/raise-ticket",
      params: {
        orderId: String(order?.orderId ?? orderId),
        orderRef: String(order?.formattedOrderId ?? order?.orderId ?? orderId),
        ...(order?.coreOrderId != null ? { coreOrderId: String(order.coreOrderId) } : {}),
      },
    });
  };

  const handleCopyOrderId = async () => {
    const text = order?.formattedOrderId ?? order?.orderId ?? orderId;
    await Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Order ID copied to clipboard.");
  };

  const handleInvoice = () => {
    Alert.alert("Invoice", "Invoice download will be available soon.");
  };

  if (!orderId) {
    return (
      <View style={[styles.center, styles.screen]}>
        <Text style={styles.mutedText}>Invalid order</Text>
      </View>
    );
  }

  if (isLoading && !order) {
    return (
      <View style={[styles.center, styles.screen]}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.mutedText}>Loading order...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, styles.screen]}>
        <Text style={styles.mutedText}>Order not found</Text>
      </View>
    );
  }

  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const restaurantName = order.merchantPublicName ?? order.merchantName ?? "Restaurant";
  const merchantArea = getCompactAddressLine(order.merchantAddress);
  const bannerUri = toAbsoluteImageUrl(order.merchantBannerUrl);
  const items = order.items ?? [];
  const bill = parseOrderBillFromSnapshot(order.billingSnapshot, order.totalAmount ?? null);
  const isCancelled = order.status === "CANCELLED";
  const isDelivered = order.status === "DELIVERED";
  const isFailed =
    order.status === "PAYMENT_FAILED" ||
    order.status === "FAILED" ||
    order.paymentStatus?.toLowerCase() === "failed";
  const paymentMethodLabel = (order.paymentMethod ?? "UPI").replace(/_/g, " ").toUpperCase();
  const statusBanner = getStatusBannerText(order.status, order.paymentStatus);

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor="#fff" />
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top - 8, 0) }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerSide} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={TEXT} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
          <TouchableOpacity onPress={handleOpenHelp} style={styles.headerSideRight} hitSlop={12}>
            <Ionicons name="headset-outline" size={18} color={GREEN} />
            <Text style={styles.supportText}>Support</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: insets.bottom + 88, paddingHorizontal: 16, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIcon, (isCancelled || isFailed) && styles.statusIconDanger]}>
                <Ionicons
                  name={isCancelled || isFailed ? "bag-remove-outline" : isDelivered ? "bag-check-outline" : "bag-outline"}
                  size={18}
                  color={isCancelled || isFailed ? "#DC2626" : GREEN}
                />
              </View>
              <Text style={styles.statusText}>{statusBanner}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.restaurantRow}>
              <View style={styles.restaurantLogo}>
                {bannerUri ? (
                  <Image source={{ uri: bannerUri }} style={styles.restaurantLogoImg} resizeMode="cover" />
                ) : (
                  <Text style={styles.restaurantInitial}>{restaurantName.slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.restaurantInfo}>
                <Text style={styles.restaurantName} numberOfLines={1}>
                  {restaurantName}
                </Text>
                {!!merchantArea && (
                  <Text style={styles.restaurantArea} numberOfLines={1}>
                    {merchantArea}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => {
                  const storeId = order.merchantPublicStoreId;
                  if (storeId) router.push(`/home/merchant/${storeId}`);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="call-outline" size={18} color={GREEN} />
              </TouchableOpacity>
            </View>

            <View style={styles.orderIdRow}>
              <Text style={styles.orderIdText}>Order ID: #{displayOrderId}</Text>
              <TouchableOpacity onPress={handleCopyOrderId} hitSlop={8}>
                <Ionicons name="copy-outline" size={16} color={MUTED} />
              </TouchableOpacity>
            </View>

            {items.map((item, index) => {
              const diet = toDietType(item.vegNonVeg);
              const lineTotal = item.lineTotal ?? item.price * item.quantity;
              const subtext = item.customization?.trim() || item.variantName?.trim() || "";
              return (
                <View key={`${displayOrderId}-item-${index}`} style={styles.itemRow}>
                  <View style={styles.itemLeft}>
                    {diet != null && (
                      <View style={styles.dietWrap}>
                        <DietIndicator type={diet} />
                      </View>
                    )}
                    <View style={styles.itemTextWrap}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.quantity} x {item.name}
                      </Text>
                      {!!subtext && (
                        <Text style={styles.itemSubtext} numberOfLines={2}>
                          {subtext}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Text style={styles.itemPrice}>₹{Math.round(lineTotal)}</Text>
                </View>
              );
            })}
          </View>

          {isInProgress ? (
            <View style={styles.card}>
              <View style={styles.mapWrap}>
                {mapReady ? (
                  <MapView ref={mapRef} style={styles.map} {...customerMapProps} region={mapRegion}>
                    {routeCoordinates.length > 0 ? (
                      <Polyline coordinates={routeCoordinates} strokeWidth={4} strokeColor={GREEN} />
                    ) : null}
                    <Marker coordinate={{ latitude: pickupLat, longitude: pickupLng }} anchor={{ x: 0.5, y: 0.5 }}>
                      <View style={styles.pickupMarker}>
                        <Ionicons name="restaurant" size={14} color="#fff" />
                      </View>
                    </Marker>
                    <Marker coordinate={{ latitude: deliveryLat, longitude: deliveryLng }} anchor={{ x: 0.5, y: 0.5 }}>
                      <View style={styles.dropMarker}>
                        <Ionicons name="home" size={14} color="#fff" />
                      </View>
                    </Marker>
                    {tracking?.rider ? (
                      <Marker
                        coordinate={{ latitude: tracking.rider.latitude, longitude: tracking.rider.longitude }}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={styles.riderMarker}>
                          <Ionicons name="bicycle" size={16} color="#fff" />
                        </View>
                      </Marker>
                    ) : null}
                  </MapView>
                ) : (
                  <View style={styles.mapPlaceholder}>
                    <ActivityIndicator size="small" color={GREEN} />
                  </View>
                )}
                {liveEtaMins != null ? (
                  <View style={styles.etaPill}>
                    <Ionicons name="time-outline" size={16} color={GREEN} />
                    <Text style={styles.etaText}>Arriving in ~{liveEtaMins} mins</Text>
                  </View>
                ) : null}
              </View>
              {order.deliveryOtp ? (
                <View style={styles.otpRow}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={GREEN} />
                  <Text style={styles.otpText}>
                    Delivery OTP: <Text style={styles.otpValue}>{order.deliveryOtp}</Text>
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.billHeader}>
              <View style={styles.billHeaderLeft}>
                <View style={styles.billIconWrap}>
                  <Ionicons name="receipt-outline" size={16} color={MUTED} />
                </View>
                <Text style={styles.billTitle}>Bill Summary</Text>
              </View>
              <TouchableOpacity onPress={handleInvoice} hitSlop={8}>
                <Ionicons name="download-outline" size={20} color={MUTED} />
              </TouchableOpacity>
            </View>

            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Item total</Text>
              <Text style={styles.billValue}>{formatMoney(bill.itemTotal || items.reduce((s, i) => s + (i.lineTotal ?? i.price * i.quantity), 0))}</Text>
            </View>
            {bill.gstAndPackaging > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>GST & restaurant packaging</Text>
                <Text style={styles.billValue}>{formatMoney(bill.gstAndPackaging)}</Text>
              </View>
            )}
            {(bill.deliveryFeeOriginal != null || bill.deliveryFee > 0.005) && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Delivery partner fee</Text>
                {bill.deliveryFee <= 0.005 && bill.deliveryFeeOriginal != null ? (
                  <View style={styles.freeDeliveryWrap}>
                    <Text style={styles.strikePrice}>{formatMoney(bill.deliveryFeeOriginal)}</Text>
                    <Text style={styles.freeText}>FREE</Text>
                  </View>
                ) : (
                  <Text style={styles.billValue}>{formatMoney(bill.deliveryFee)}</Text>
                )}
              </View>
            )}
            {bill.platformFee > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Platform fee</Text>
                <Text style={styles.billValue}>{formatMoney(bill.platformFee)}</Text>
              </View>
            )}
            {bill.donation > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.billLabel}>Feeding India donation</Text>
                <Text style={styles.billValue}>{formatMoney(bill.donation)}</Text>
              </View>
            )}

            <View style={[styles.billRow, styles.billGrandRow]}>
              <Text style={styles.billGrandLabel}>Grand total</Text>
              <Text style={styles.billGrandValue}>{formatMoney(bill.grandTotal || bill.paid)}</Text>
            </View>

            {bill.couponDiscount > 0.005 && (
              <View style={styles.billRow}>
                <Text style={styles.couponLabel}>
                  Coupon applied{bill.couponCode ? ` - ${bill.couponCode}` : ""}
                </Text>
                <Text style={styles.couponValue}>- {formatMoney(bill.couponDiscount)}</Text>
              </View>
            )}

            <View style={styles.billRow}>
              <Text style={styles.paidLabel}>{isCancelled || isFailed ? "Amount" : "Paid"}</Text>
              <Text style={styles.paidValue}>{formatMoney(bill.paid)}</Text>
            </View>

            {bill.totalSavings > 0.005 && (
              <View style={styles.savingsBanner}>
                <Text style={styles.savingsText}>🎉 You saved {formatMoney(bill.totalSavings)} on this order!</Text>
              </View>
            )}
          </View>

          {order.rider ? (
            <View style={styles.card}>
              <View style={styles.riderRow}>
                <View style={styles.riderAvatar}>
                  <Text style={styles.riderAvatarText}>{order.rider.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.riderInfo}>
                  <Text style={styles.riderName}>{order.rider.name}</Text>
                  {order.rider.phone ? (
                    <Text style={styles.riderPhone}>{maskPhone(order.rider.phone)}</Text>
                  ) : null}
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Ionicons name="wallet-outline" size={20} color={GREEN} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Payment method</Text>
                <Text style={styles.infoSub}>Paid via: {paymentMethodLabel}</Text>
              </View>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color={GREEN} />
              <View style={styles.infoTextWrap}>
                <Text style={styles.infoTitle}>Payment date</Text>
                <Text style={styles.infoSub}>{formatPaymentDate(order.createdAt)}</Text>
              </View>
            </View>
            {!!order.deliveryAddress && (
              <>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={20} color={GREEN} />
                  <View style={styles.infoTextWrap}>
                    <Text style={styles.infoTitle}>Delivery address</Text>
                    <Text style={styles.infoSub}>{order.deliveryAddress}</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity style={styles.invoiceBtn} onPress={handleInvoice} activeOpacity={0.9}>
            <Ionicons name="download-outline" size={18} color={GREEN} />
            <Text style={styles.invoiceText}>Invoice</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  mutedText: { marginTop: 12, fontSize: 15, color: MUTED },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: PAGE_BG,
  },
  headerSide: {
    width: 88,
    flexDirection: "row",
    alignItems: "center",
  },
  headerSideRight: {
    width: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: TEXT,
  },
  supportText: {
    fontSize: 13,
    fontWeight: "600",
    color: GREEN,
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: CARD,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  mapWrap: {
    height: 200,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  map: { ...StyleSheet.absoluteFillObject },
  mapPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F0",
  },
  pickupMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  dropMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#374151",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  riderMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  etaPill: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  etaText: { fontSize: 14, fontWeight: "600", color: TEXT },
  otpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  otpText: { fontSize: 13, color: MUTED },
  otpValue: { fontWeight: "700", color: TEXT },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0FDF4",
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconDanger: { backgroundColor: "#FEF2F2" },
  statusText: { flex: 1, fontSize: 16, fontWeight: "700", color: TEXT },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  restaurantLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  restaurantLogoImg: { width: "100%", height: "100%" },
  restaurantInitial: { fontSize: 18, fontWeight: "700", color: GREEN },
  restaurantInfo: { flex: 1 },
  restaurantName: { fontSize: 16, fontWeight: "700", color: TEXT },
  restaurantArea: { marginTop: 2, fontSize: 12, color: MUTED },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  orderIdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  orderIdText: { fontSize: 13, fontWeight: "600", color: TEXT },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 12,
    gap: 10,
  },
  itemLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  dietWrap: { marginTop: 2 },
  itemTextWrap: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: "600", color: TEXT, lineHeight: 18 },
  itemSubtext: { marginTop: 2, fontSize: 12, color: MUTED, lineHeight: 16 },
  itemPrice: { fontSize: 14, fontWeight: "700", color: TEXT },
  billHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  billHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  billIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  billTitle: { fontSize: 15, fontWeight: "700", color: TEXT },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  billLabel: { flex: 1, fontSize: 13, color: MUTED, paddingRight: 8 },
  billValue: { fontSize: 13, fontWeight: "600", color: TEXT },
  freeDeliveryWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  strikePrice: {
    fontSize: 13,
    color: MUTED,
    textDecorationLine: "line-through",
  },
  freeText: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  billGrandRow: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  billGrandLabel: { fontSize: 14, fontWeight: "700", color: TEXT },
  billGrandValue: { fontSize: 14, fontWeight: "700", color: TEXT },
  couponLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: LINK_BLUE },
  couponValue: { fontSize: 13, fontWeight: "700", color: LINK_BLUE },
  paidLabel: { fontSize: 15, fontWeight: "700", color: TEXT },
  paidValue: { fontSize: 15, fontWeight: "800", color: TEXT },
  savingsBanner: {
    marginTop: 10,
    backgroundColor: "#EBF5FF",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  savingsText: { fontSize: 13, fontWeight: "600", color: LINK_BLUE, textAlign: "center" },
  riderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  riderAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  riderAvatarText: { fontSize: 16, fontWeight: "700", color: GREEN },
  riderInfo: { flex: 1 },
  riderName: { fontSize: 15, fontWeight: "700", color: TEXT },
  riderPhone: { marginTop: 2, fontSize: 12, color: MUTED },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 4 },
  infoDivider: { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  infoTextWrap: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: "700", color: TEXT },
  infoSub: { marginTop: 3, fontSize: 12, lineHeight: 17, color: MUTED },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PAGE_BG,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  invoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 10,
    paddingVertical: 14,
    backgroundColor: CARD,
  },
  invoiceText: { fontSize: 15, fontWeight: "700", color: GREEN },
});
