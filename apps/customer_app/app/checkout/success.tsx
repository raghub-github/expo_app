/**
 * Order placed – success confirmation (GatiMitra style).
 * Shown immediately after payment verification. Auto-redirects to live tracking.
 */

import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRoute } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeIn } from "react-native-reanimated";
import { orderService } from "@/services/order.service";
import { LegalFooter } from "@/components/LegalLinks";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAD = 20;
const CARD_RADIUS = 18;
const AUTO_REDIRECT_SEC = 4;
const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = GatiMitraColors.deepMintStart;

function OrderInfoRow({
  icon,
  label,
  value,
  valueColor = GatiMitraColors.textPrimary,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
      <View style={styles.infoLeft}>
        <View style={styles.infoIconWrap}>
          <Ionicons name={icon} size={18} color={GREEN} />
        </View>
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function OrderSuccessFooterArt() {
  return (
    <View style={styles.footerArt} pointerEvents="none">
      <View style={styles.footerSkyline}>
        {[28, 44, 36, 52, 32, 40, 48].map((h, i) => (
          <View key={i} style={[styles.footerBuilding, { height: h, opacity: 0.35 + (i % 3) * 0.08 }]} />
        ))}
      </View>
      <View style={styles.footerScene}>
        <View style={styles.footerStore}>
          <MaterialCommunityIcons name="storefront-outline" size={42} color={GREEN} />
        </View>
        <View style={styles.footerBag}>
          <MaterialCommunityIcons name="shopping" size={28} color={GREEN_DARK} />
        </View>
        <View style={styles.footerCup}>
          <MaterialCommunityIcons name="coffee-outline" size={22} color={GREEN} />
        </View>
      </View>
    </View>
  );
}

export default function OrderSuccessScreen() {
  const {
    orderId: orderIdParam,
    formattedOrderId: formattedOrderIdParam,
    merchantName: paramMerchantName,
    etaMinutes: paramEtaMinutes,
    deliveryEtaLabel: paramDeliveryEtaLabel,
  } = useLocalSearchParams<{
    orderId?: string | string[];
    formattedOrderId?: string | string[];
    merchantName?: string;
    etaMinutes?: string | number;
    deliveryEtaLabel?: string;
  }>();
  const route = useRoute();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [secondsLeft, setSecondsLeft] = useState(AUTO_REDIRECT_SEC);

  const fromUrl = Array.isArray(orderIdParam) ? orderIdParam[0] : orderIdParam;
  const fromFormattedUrl = Array.isArray(formattedOrderIdParam)
    ? formattedOrderIdParam[0]
    : formattedOrderIdParam;
  const fromParams = (route.params as { orderId?: string } | undefined)?.orderId;
  const id = (fromUrl ?? fromParams ?? "").toString();
  const merchantName =
    (route.params as { merchantName?: string } | undefined)?.merchantName ??
    (paramMerchantName as string | undefined);
  const etaFromParams =
    (route.params as { etaMinutes?: number } | undefined)?.etaMinutes ??
    (paramEtaMinutes != null ? Number(paramEtaMinutes) : undefined);
  const deliveryEtaLabelFromParams =
    (route.params as { deliveryEtaLabel?: string } | undefined)?.deliveryEtaLabel ??
    (typeof paramDeliveryEtaLabel === "string" ? paramDeliveryEtaLabel.trim() : "");

  const { data: order } = useQuery({
    queryKey: ["order", id],
    queryFn: () => orderService.getOrder(id),
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    setSecondsLeft(AUTO_REDIRECT_SEC);
    const countdown = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    const redirect = setTimeout(() => {
      router.replace(`/orders/${id}` as const);
    }, AUTO_REDIRECT_SEC * 1000);
    return () => {
      clearInterval(countdown);
      clearTimeout(redirect);
    };
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

  const displayDeliveryEta =
    deliveryEtaLabelFromParams ||
    (typeof etaFromParams === "number" && etaFromParams > 0 ? `${etaFromParams} mins` : null);
  const orderIdDisplay = order?.formattedOrderId ?? fromFormattedUrl ?? order?.orderId ?? id;
  const displayMerchantName = order?.merchantName ?? merchantName ?? "Your restaurant";
  const deliveryAddress = order?.deliveryAddress?.trim() ?? "";

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)} style={styles.successHeader}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={46} color="#fff" />
          </View>
          <Text style={styles.title}>🎉 Order placed successfully!</Text>
          <Text style={styles.subtitle}>
            We&apos;ve received your order and will start preparing it soon.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.duration(300).delay(120)} style={styles.card}>
          <OrderInfoRow
            icon="receipt-outline"
            label="Order ID"
            value={`#${orderIdDisplay}`}
            valueColor={GREEN}
          />
          <OrderInfoRow
            icon="restaurant-outline"
            label="Restaurant"
            value={displayMerchantName}
            isLast={!displayDeliveryEta}
          />
          {displayDeliveryEta ? (
            <OrderInfoRow
              icon="time-outline"
              label="Estimated delivery"
              value={displayDeliveryEta}
              valueColor={GREEN}
              isLast
            />
          ) : null}
        </Animated.View>

        {deliveryAddress ? (
          <Animated.View entering={FadeIn.duration(300).delay(200)}>
            <TouchableOpacity style={styles.addressCard} activeOpacity={0.92}>
              <View style={styles.addressIconWrap}>
                <Ionicons name="location" size={20} color={GREEN} />
              </View>
              <View style={styles.addressBody}>
                <Text style={styles.addressLabel}>Delivery address</Text>
                <Text style={styles.addressText} numberOfLines={2}>
                  {deliveryAddress}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={GatiMitraColors.textSecondary} />
            </TouchableOpacity>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeIn.duration(300).delay(280)} style={styles.actions}>
          <TouchableOpacity onPress={trackOrder} style={styles.trackBtn} activeOpacity={0.88}>
            <Ionicons name="paper-plane" size={20} color="#fff" />
            <Text style={styles.trackBtnText}>Track Order</Text>
          </TouchableOpacity>

          <View style={styles.redirectRow}>
            <View style={styles.redirectDot} />
            <Text style={styles.autoRedirectHint}>
              Opening live tracking in {Math.max(secondsLeft, 0)} second
              {secondsLeft === 1 ? "" : "s"}…
            </Text>
          </View>

          <TouchableOpacity onPress={goHome} style={styles.homeBtn} activeOpacity={0.88}>
            <Ionicons name="home-outline" size={20} color={GatiMitraColors.textPrimary} />
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </Animated.View>

        <LegalFooter
          prefix="See"
          docIds={["shipping-delivery-policy", "refund-cancellation-policy"]}
        />
      </ScrollView>

      <OrderSuccessFooterArt />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F8FAFB",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: PAD, flexGrow: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFB",
  },
  errText: { fontSize: 16, color: GatiMitraColors.textSecondary, marginBottom: 16 },
  successHeader: {
    alignItems: "center",
    marginBottom: 28,
  },
  checkCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.9)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  infoRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraColors.border,
  },
  infoLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoLabel: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    fontWeight: "500",
  },
  infoValue: {
    fontSize: 14,
    fontWeight: "700",
    maxWidth: "42%",
    textAlign: "right",
  },
  addressCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "rgba(229,231,235,0.9)",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    gap: 12,
  },
  addressIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(34,197,94,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  addressBody: { flex: 1, minWidth: 0 },
  addressLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    marginBottom: 4,
  },
  addressText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    lineHeight: 19,
  },
  actions: { gap: 12, marginTop: 4 },
  trackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: GREEN,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  trackBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  redirectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 2,
  },
  redirectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GREEN,
  },
  autoRedirectHint: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
  },
  homeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  homeBtnText: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
  primaryBtn: {
    backgroundColor: GREEN,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  footerArt: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
    overflow: "hidden",
  },
  footerSkyline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 36,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    paddingHorizontal: 8,
  },
  footerBuilding: {
    width: 22,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    backgroundColor: GREEN,
  },
  footerScene: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 28,
    opacity: 0.55,
  },
  footerStore: {
    marginBottom: 2,
  },
  footerBag: {
    marginBottom: 10,
  },
  footerCup: {
    marginBottom: 4,
  },
});
