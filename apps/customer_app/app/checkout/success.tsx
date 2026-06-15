/**
 * Order placed – success confirmation (GatiMitra style).
 * Shown immediately after payment verification. No auto-reload, no delayed redirect.
 */

import { useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  FadeInDown,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { orderService } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAD = 20;
const CARD_RADIUS = 16;
const ETA_DEFAULT_MINS = 25;

const CONFETTI_COLORS = ["#14b8a6", "#0d9488", "#5eead4", "#99f6e4", "#fbbf24", "#f59e0b"];
const CONFETTI_COUNT = 16;

function ConfettiBurst() {
  const particles = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        angle: (i / CONFETTI_COUNT) * 360,
        size: 6 + (i % 4),
        delay: i * 30,
        x: 50 + (i % 5) * 20 - 40,
      })),
    []
  );
  return (
    <View style={confettiStyles.wrap} pointerEvents="none">
      {particles.map((p) => (
        <ConfettiDot key={p.id} color={p.color} angle={p.angle} size={p.size} delay={p.delay} startX={p.x} />
      ))}
    </View>
  );
}

function ConfettiDot({
  color,
  angle,
  size,
  delay,
  startX,
}: {
  color: string;
  angle: number;
  size: number;
  delay: number;
  startX: number;
}) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(startX);
  const opacity = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    const rad = (angle * Math.PI) / 180;
    const dx = Math.cos(rad) * 80;
    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(120, { duration: 600 }),
        withTiming(200, { duration: 400 })
      )
    );
    translateX.value = withDelay(delay, withTiming(startX + dx, { duration: 800 }));
    opacity.value = withDelay(delay + 500, withTiming(0, { duration: 400 }));
    scale.value = withDelay(delay, withSequence(withTiming(1.2, { duration: 200 }), withTiming(0.5, { duration: 600 })));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        confettiStyles.dot,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

const confettiStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    height: 220,
    alignItems: "center",
    justifyContent: "flex-start",
  },
  dot: {},
});

const AUTO_REDIRECT_SEC = 4;

export default function OrderSuccessScreen() {
  const { orderId: orderIdParam, formattedOrderId: formattedOrderIdParam, merchantName: paramMerchantName, etaMinutes: paramEtaMinutes } = useLocalSearchParams<{
    orderId?: string | string[];
    formattedOrderId?: string | string[];
    merchantName?: string;
    etaMinutes?: string | number;
  }>();
  const route = useRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fromUrl = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const fromFormattedUrl = Array.isArray(formattedOrderIdParam) ? formattedOrderIdParam[0] : formattedOrderIdParam;
  const fromParams = (route.params as { orderId?: string } | undefined)?.orderId;
  const id = (fromUrl ?? fromParams ?? "").toString();
  const merchantName = (route.params as { merchantName?: string } | undefined)?.merchantName ?? (paramMerchantName as string | undefined);
  const etaFromParams =
    (route.params as { etaMinutes?: number } | undefined)?.etaMinutes ??
    (paramEtaMinutes != null ? Number(paramEtaMinutes) : undefined);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderService.getOrder(id),
    enabled: !!id,
  });

  // Auto-redirect to tracking after 3–5 seconds (no reload, no home)
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => {
      router.replace(`/orders/${id}` as const);
    }, AUTO_REDIRECT_SEC * 1000);
    return () => clearTimeout(t);
  }, [id, router]);

  const goHome = () => {
    router.replace("/(tabs)/");
  };

  const trackOrder = () => {
    router.replace(`/orders/${id}` as const);
  };

  if (!id) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <Text style={styles.errText}>Invalid order</Text>
        <TouchableOpacity onPress={goHome} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const displayEta = typeof etaFromParams === "number" && etaFromParams > 0 ? etaFromParams : ETA_DEFAULT_MINS;
  const orderIdDisplay = order?.formattedOrderId ?? fromFormattedUrl ?? order?.orderId ?? id;
  const displayMerchantName = order?.merchantName ?? merchantName ?? undefined;
  // Show success UI immediately when we have orderId (from params); optional order fetch for summary/address
  const showSuccessContent = true;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <ConfettiBurst />
      <Animated.View entering={FadeInDown.duration(400)} style={styles.successHeader}>
        <View style={styles.checkWrap}>
          <LinearGradient
            colors={GatiMitraColors.deepMintGradient as unknown as [string, string]}
            style={styles.checkCircle}
          >
            <Ionicons name="checkmark" size={48} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.title}>🎉 Order placed successfully!</Text>
        <Text style={styles.subtitle}>We've received your order and will start preparing it soon.</Text>
      </Animated.View>

      <Animated.View entering={FadeIn.duration(300).delay(150)} style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.cardLabel}>Order ID</Text>
          <Text style={styles.cardValue}>#{orderIdDisplay}</Text>
        </View>
        {displayMerchantName ? (
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Restaurant</Text>
            <Text style={styles.cardValue} numberOfLines={1}>{displayMerchantName}</Text>
          </View>
        ) : null}
        <View style={[styles.cardRow, styles.etaRow]}>
          <Ionicons name="time-outline" size={20} color={GatiMitraColors.emerald} />
          <Text style={styles.etaText}>Estimated delivery in ~{displayEta} mins</Text>
        </View>
      </Animated.View>

      {order?.items && order.items.length > 0 && (
        <Animated.View entering={FadeIn.duration(300).delay(220)} style={styles.card}>
          <Text style={styles.sectionTitle}>Order summary</Text>
          {order.items.slice(0, 4).map((item: { name?: string; quantity?: number; price?: number }, i: number) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name ?? "Item"} × {item.quantity ?? 1}
              </Text>
              <Text style={styles.itemPrice}>₹{((item.price ?? 0) * (item.quantity ?? 1)).toFixed(0)}</Text>
            </View>
          ))}
          {order.items.length > 4 && (
            <Text style={styles.moreItems}>+{order.items.length - 4} more</Text>
          )}
          {order.totalAmount != null && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{Number(order.totalAmount).toFixed(0)}</Text>
            </View>
          )}
        </Animated.View>
      )}

      {order?.deliveryAddress && (
        <Animated.View entering={FadeIn.duration(300).delay(280)} style={styles.card}>
          <View style={styles.addressRow}>
            <Ionicons name="location" size={20} color={GatiMitraColors.emerald} />
            <Text style={styles.addressLabel}>Delivery address</Text>
          </View>
          <Text style={styles.addressText}>{order?.deliveryAddress}</Text>
        </Animated.View>
      )}

      <Animated.View entering={FadeIn.duration(300).delay(340)} style={styles.actions}>
        <TouchableOpacity onPress={trackOrder} style={styles.trackBtn} activeOpacity={0.85}>
          <LinearGradient
            colors={GatiMitraColors.deepMintGradient as unknown as [string, string]}
            style={styles.trackBtnGradient}
          >
            <Ionicons name="navigate" size={22} color="#fff" />
            <Text style={styles.trackBtnText}>Track Order</Text>
          </LinearGradient>
        </TouchableOpacity>
        <Text style={styles.autoRedirectHint}>Opening live tracking in {AUTO_REDIRECT_SEC} seconds…</Text>
        <TouchableOpacity onPress={goHome} style={styles.homeBtn} activeOpacity={0.85}>
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  scrollContent: { paddingHorizontal: PAD },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: GatiMitraColors.softBackground },
  errText: { fontSize: 16, color: GatiMitraColors.textSecondary, marginBottom: 16 },
  loadingText: { marginTop: 12, fontSize: 15, color: GatiMitraColors.textSecondary },
  successHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  checkWrap: { marginBottom: 16 },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: PAD,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  cardLabel: { fontSize: 14, color: GatiMitraColors.textSecondary },
  cardValue: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary, maxWidth: "60%" },
  etaRow: { marginTop: 4, marginBottom: 0 },
  etaText: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.emerald, marginLeft: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary, marginBottom: 12 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  itemName: { fontSize: 14, color: GatiMitraColors.textPrimary },
  itemPrice: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary },
  moreItems: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 4 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
  },
  totalLabel: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary },
  totalValue: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.emerald },
  addressRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  addressLabel: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary, marginLeft: 8 },
  addressText: { fontSize: 14, color: GatiMitraColors.textSecondary, lineHeight: 20 },
  actions: { marginTop: 8, gap: 12 },
  trackBtn: { borderRadius: 14, overflow: "hidden" },
  trackBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  trackBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  autoRedirectHint: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  homeBtn: {
    backgroundColor: "#fff",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  homeBtnText: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
  primaryBtn: {
    backgroundColor: GatiMitraColors.emerald,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
