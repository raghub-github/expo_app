// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  ImageBackground,
  Linking,
  Platform,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/src/theme";
import { riderApi } from "@/src/services/api/riderApi";
import { buildRideDeliverySuccessParams } from "@/src/lib/ride-delivery-success-nav";
import { isRideFarePaymentSettled } from "@/src/lib/ride-payment-wait";
import { resolveRiderDisplayedEarning, buildRiderRideEarningBreakdown } from "@/src/lib/rider-earning-display";
import { RIDER_ACTIVE_ORDERS_QUERY_KEY, RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY } from "@/src/hooks/useOrders";
import { useAppAssetSource } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";

const POLL_MS = 15_000;

function isCashRideOrder(order: unknown): boolean {
  const method = String(
    (order as { paymentMethod?: string })?.paymentMethod ?? ""
  )
    .trim()
    .toLowerCase();
  return method === "cash" || method === "cod";
}
const MINT = colors.primary[600];
const MINT_DARK = colors.primary[700];

function formatClock(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function formatFare(amount: number): string {
  const n = Math.round(amount);
  return `₹${n.toLocaleString("en-IN")}`;
}

type TimelineStep = {
  key: string;
  title: string;
  subtitle?: string;
  state: "done" | "active" | "pending";
};

function TimelineRow({ step, isLast }: { step: TimelineStep; isLast?: boolean }) {
  const dotColor =
    step.state === "done" ? MINT : step.state === "active" ? "#F59E0B" : "#D1D5DB";
  const titleColor = step.state === "pending" ? "#9CA3AF" : "#111827";

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRailCol}>
        {step.state === "done" ? (
          <View style={[styles.timelineDot, { backgroundColor: MINT }]}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        ) : step.state === "active" ? (
          <View style={[styles.timelineDot, styles.timelineDotActive]}>
            <View style={styles.timelineDotInner} />
          </View>
        ) : (
          <View style={[styles.timelineDot, { backgroundColor: "#E5E7EB" }]} />
        )}
        {!isLast ? <View style={[styles.timelineLine, { backgroundColor: dotColor }]} /> : null}
      </View>
      <View style={styles.timelineTextCol}>
        <Text style={[styles.timelineTitle, { color: titleColor }]}>{step.title}</Text>
        {step.subtitle ? <Text style={styles.timelineSub}>{step.subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function RidePaymentWaitingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const waitingHero = useAppAssetSource(RX.orders.waitingHero);
  const params = useLocalSearchParams<{ orderId?: string; displayId?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date());

  const isCashRide = useMemo(() => isCashRideOrder(order), [order]);

  const { data: order, isFetching } = useQuery({
    queryKey: ["rider", "orders", "detail", orderId],
    queryFn: async () => {
      const row = await riderApi.getRideOrder(orderId);
      setLastCheckedAt(new Date());
      return row;
    },
    enabled: orderId.length > 0,
    // Cash rides never need polling — the rider taps "Cash received" to finish.
    refetchInterval: isCashRide ? false : POLL_MS,
  });

  const goToSuccess = useCallback(
    (deliveredOrder: NonNullable<typeof order>) => {
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY });
      router.replace({
        pathname: "/ride-delivery-success",
        params: { ...buildRideDeliverySuccessParams(deliveredOrder), kind: "ride" },
      });
    },
    [queryClient]
  );

  useEffect(() => {
    if (!order || !isRideFarePaymentSettled(order)) return;
    goToSuccess(order);
  }, [order, goToSuccess]);

  const cashMutation = useMutation({
    mutationFn: async () => riderApi.confirmRideCashCollected(orderId),
    onSuccess: async () => {
      // Refresh the underlying order (payment_status becomes completed) so the
      // success-navigation effect above fires.
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY });
      const refreshed = await riderApi.getRideOrder(orderId);
      goToSuccess(refreshed);
    },
    onError: (err) => {
      const message =
        (err as { message?: string })?.message ??
        t(
          "orders.ridePaymentWait.cashError",
          "Could not confirm the cash collection. Please try again."
        );
      Alert.alert(t("common.error", "Something went wrong"), String(message));
    },
  });

  // Rider chose "Online" this session → we show the QR (kept in local state; the ride
  // is finalized backend-side by the qr_code.credited webhook, which flips the order to
  // settled and triggers the success-navigation effect above).
  const [onlineChosen, setOnlineChosen] = useState(false);
  const [qrInfo, setQrInfo] = useState<{ qrImageUrl: string; amount: number } | null>(null);

  const qrMutation = useMutation({
    mutationFn: async () => riderApi.createRideOnlineQr(orderId),
    onSuccess: (data) => {
      setQrInfo({ qrImageUrl: data.qrImageUrl, amount: data.amount });
    },
    onError: (err) => {
      Alert.alert(
        t("common.error", "Something went wrong"),
        String(
          (err as { message?: string })?.message ??
            t("orders.ridePaymentWait.qrError", "Could not create the payment QR. Please try again.")
        )
      );
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (method: "cash" | "online") =>
      riderApi.selectRidePaymentMethod(orderId, method),
    onSuccess: async (_res, method) => {
      if (method === "cash") {
        // Refresh so order.paymentMethod becomes cash → the cash card renders.
        await queryClient.invalidateQueries({ queryKey: ["rider", "orders", "detail", orderId] });
      } else {
        setOnlineChosen(true);
        qrMutation.mutate();
      }
    },
    onError: (err) => {
      Alert.alert(
        t("common.error", "Something went wrong"),
        String(
          (err as { message?: string })?.message ??
            t("orders.ridePaymentWait.selectError", "Could not set the payment method. Please try again.")
        )
      );
    },
  });

  const selectingMethod = selectMutation.isPending || qrMutation.isPending;

  const displayId = params.displayId?.trim() || order?.formattedOrderId || orderId;
  const earningBreakdown = useMemo(
    () => buildRiderRideEarningBreakdown(order, t),
    [order, t]
  );
  const riderReceives = earningBreakdown.totalEarning;
  const customerPays = useMemo(() => {
    const fromOrder = Number(
      (order as { totalAmount?: number; grandTotal?: number; fareAmount?: number })?.totalAmount ??
        (order as { grandTotal?: number })?.grandTotal ??
        (order as { fareAmount?: number })?.fareAmount ??
        0
    );
    if (Number.isFinite(fromOrder) && fromOrder > 0) return Math.round(fromOrder);
    return riderReceives;
  }, [order, riderReceives]);
  const companyKeeps = Math.max(0, customerPays - riderReceives);
  const fareAmount = customerPays;
  const completedAt = order?.createdAt ?? null;

  const timelineSteps = useMemo<TimelineStep[]>(
    () => [
      {
        key: "completed",
        title: t("orders.ridePaymentWait.stepCompleted", "Ride Completed"),
        subtitle: formatClock(completedAt),
        state: "done",
      },
      {
        key: "processing",
        title: t("orders.ridePaymentWait.stepProcessing", "Payment Processing"),
        subtitle: t("orders.ridePaymentWait.stepProcessingSub", "Checking payment status…"),
        state: "active",
      },
      {
        key: "earnings",
        title: t("orders.ridePaymentWait.stepEarnings", "Earnings Pending"),
        subtitle: t("orders.ridePaymentWait.stepEarningsSub", "Will be credited soon"),
        state: "pending",
      },
    ],
    [completedAt, t]
  );

  const customerPhone = order?.customerPhone?.trim() ?? "";
  const hasCallablePhone = customerPhone.replace(/\D/g, "").length >= 10;

  const handleCallCustomer = useCallback(() => {
    if (!hasCallablePhone) return;
    const digits = customerPhone.replace(/\D/g, "");
    const tel = digits.length === 10 ? `+91${digits}` : customerPhone.startsWith("+") ? customerPhone : `+${digits}`;
    void Linking.openURL(`tel:${tel}`).catch(() => {
      /* silent */
    });
  }, [customerPhone, hasCallablePhone]);

  const handleContactSupport = useCallback(() => {
    router.push("/raise-ticket");
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {waitingHero ? (
          <ImageBackground source={waitingHero} style={styles.hero} imageStyle={styles.heroImage}>
          <LinearGradient
            colors={["rgba(15,23,42,0.35)", "rgba(15,23,42,0.82)"]}
            style={StyleSheet.absoluteFill}
          />
          <SafeAreaView edges={["top"]} style={styles.heroSafe}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroTitle}>
                {t("orders.ridePaymentWait.heroTitle", "Fare Pending")}
              </Text>
              <Text style={styles.heroSub}>
                {t("orders.ridePaymentWait.heroSub", "Waiting for passenger payment")}
              </Text>
            </View>
          </SafeAreaView>
        </ImageBackground>
        ) : (
          <View style={styles.hero} />
        )}

        <View style={styles.body}>
          <View style={styles.fareCard}>
            <View style={styles.fareTopRow}>
              <View style={styles.fareLeft}>
                <View style={styles.pendingBadge}>
                  <Ionicons name="hourglass-outline" size={12} color="#B45309" />
                  <Text style={styles.pendingBadgeText}>
                    {t("orders.ridePaymentWait.badge", "Payment Pending")}
                  </Text>
                </View>
                <Text style={styles.fareAmount}>{formatFare(fareAmount)}</Text>
                <Text style={styles.fareLabel}>
                  {t("orders.ridePaymentWait.fareLabel", "Fare to be received")}
                </Text>
                {displayId ? (
                  <Text style={styles.rideRef}>
                    {t("orders.ridePaymentWait.rideRef", "Ride #{{id}}", { id: displayId })}
                  </Text>
                ) : null}
              </View>
              <View style={styles.timelineCol}>
                {timelineSteps.map((step, idx) => (
                  <TimelineRow
                    key={step.key}
                    step={step}
                    isLast={idx === timelineSteps.length - 1}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>
              {t("orders.ridePaymentWait.settlementTitle", "Settlement summary")}
            </Text>
            <View style={styles.feeRow}>
              <Text style={styles.feeRowLabel}>
                {t("orders.ridePaymentWait.customerPays", "Customer Pays")}
              </Text>
              <Text style={styles.feeRowValue}>{formatFare(customerPays)}</Text>
            </View>
            <View style={styles.feeRow}>
              <Text style={styles.feeRowLabel}>
                {t("orders.ridePaymentWait.riderReceives", "Rider Receives")}
              </Text>
              <Text style={[styles.feeRowValue, { color: MINT_DARK }]}>
                {formatFare(riderReceives)}
              </Text>
            </View>
            <View style={[styles.feeRow, styles.feeRowTotal]}>
              <Text style={[styles.feeRowLabel, styles.feeRowLabelTotal]}>
                {t("orders.ridePaymentWait.companyKeeps", "Company Keeps")}
              </Text>
              <Text style={[styles.feeRowValue, styles.feeRowValueTotal]}>
                {formatFare(companyKeeps)}
              </Text>
            </View>
          </View>

          <View style={styles.breakdownCard}>
            <Text style={styles.breakdownTitle}>
              {t("orders.ridePaymentWait.breakdownTitle", "Earnings breakdown")}
            </Text>
            {earningBreakdown.lines.map((line, idx) => (
              <View
                key={line.label}
                style={[styles.feeRow, line.emphasis && styles.feeRowTotal]}
              >
                <Text style={[styles.feeRowLabel, line.emphasis && styles.feeRowLabelTotal]}>
                  {line.label}
                </Text>
                <Text style={[styles.feeRowValue, line.emphasis && styles.feeRowValueTotal]}>
                  {line.emphasis || idx === 0
                    ? formatFare(line.amount)
                    : `+ ${formatFare(line.amount)}`}
                </Text>
              </View>
            ))}
          </View>

          {isCashRide ? (
            <View style={styles.cashCard}>
              <View style={styles.cashIconWrap}>
                <Ionicons name="cash-outline" size={22} color={MINT_DARK} />
              </View>
              <View style={styles.cashTextCol}>
                <Text style={styles.cashTitle}>
                  {t(
                    "orders.ridePaymentWait.cashTitle",
                    "Collect {{amount}} in cash",
                    { amount: formatFare(fareAmount) }
                  )}
                </Text>
                <Text style={styles.cashSub}>
                  {t(
                    "orders.ridePaymentWait.cashSub",
                    "Company share (≈ {{company}}) will be deducted from your wallet; you keep {{rider}}.",
                    {
                      company: formatFare(companyKeeps),
                      rider: formatFare(riderReceives),
                    }
                  )}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.cashCta,
                    (cashMutation.isPending || cashMutation.isSuccess) && styles.cashCtaDisabled,
                  ]}
                  onPress={() => cashMutation.mutate()}
                  disabled={cashMutation.isPending || cashMutation.isSuccess}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    "orders.ridePaymentWait.cashCta",
                    "Cash received"
                  )}
                >
                  {cashMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.cashCtaLabel}>
                        {t(
                          "orders.ridePaymentWait.cashCta",
                          "Cash received"
                        )}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : !onlineChosen ? (
            <View style={styles.cashCard}>
              <View style={styles.cashTextCol}>
                <Text style={styles.cashTitle}>
                  {t(
                    "orders.ridePaymentWait.chooseTitle",
                    "Collect {{amount}} — how is the passenger paying?",
                    { amount: formatFare(fareAmount) }
                  )}
                </Text>
                <Text style={styles.cashSub}>
                  {t(
                    "orders.ridePaymentWait.chooseSub",
                    "Cash if they hand you money, or Online to show a UPI QR."
                  )}
                </Text>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.cashCta, { flex: 1 }, selectingMethod && styles.cashCtaDisabled]}
                    onPress={() => selectMutation.mutate("cash")}
                    disabled={selectingMethod}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t("orders.ridePaymentWait.chooseCash", "Cash")}
                  >
                    <Ionicons name="cash-outline" size={18} color="#fff" />
                    <Text style={styles.cashCtaLabel}>
                      {t("orders.ridePaymentWait.chooseCash", "Cash")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.cashCta,
                      { flex: 1, backgroundColor: MINT_DARK },
                      selectingMethod && styles.cashCtaDisabled,
                    ]}
                    onPress={() => selectMutation.mutate("online")}
                    disabled={selectingMethod}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t("orders.ridePaymentWait.chooseOnline", "Online")}
                  >
                    {selectingMethod ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="qr-code-outline" size={18} color="#fff" />
                        <Text style={styles.cashCtaLabel}>
                          {t("orders.ridePaymentWait.chooseOnline", "Online")}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <>
              {qrInfo ? (
                <View style={[styles.cashCard, { flexDirection: "column", alignItems: "center" }]}>
                  <Text style={[styles.cashTitle, { textAlign: "center" }]}>
                    {t(
                      "orders.ridePaymentWait.qrTitle",
                      "Ask the passenger to scan & pay {{amount}}",
                      { amount: formatFare(qrInfo.amount) }
                    )}
                  </Text>
                  <Image
                    source={{ uri: qrInfo.qrImageUrl }}
                    style={{ width: 220, height: 220, marginTop: 12 }}
                    resizeMode="contain"
                    accessibilityLabel="Payment QR code"
                  />
                  <Text style={[styles.cashSub, { marginTop: 8, textAlign: "center" }]}>
                    {t(
                      "orders.ridePaymentWait.qrSub",
                      "This confirms automatically once they pay."
                    )}
                  </Text>
                </View>
              ) : (
                <View style={styles.liveCard}>
                  <View style={styles.liveIconWrap}>
                    <ActivityIndicator color={MINT} size="small" />
                  </View>
                  <View style={styles.liveTextCol}>
                    <Text style={styles.liveTitle}>
                      {t("orders.ridePaymentWait.qrLoading", "Generating QR…")}
                    </Text>
                  </View>
                </View>
              )}
              <View style={styles.liveCard}>
                <View style={styles.liveIconWrap}>
                  <ActivityIndicator color={MINT} size="small" />
                </View>
                <View style={styles.liveTextCol}>
                  <Text style={styles.liveTitle}>
                    {t("orders.ridePaymentWait.liveTitle", "Checking payment status…")}
                  </Text>
                  <Text style={styles.liveSub}>
                    {t(
                      "orders.ridePaymentWait.liveSub",
                      "We're waiting for the passenger to pay online."
                    )}
                  </Text>
                </View>
              </View>

              <View style={styles.refreshRow}>
                <View style={styles.refreshLeft}>
                  <Ionicons name="refresh-outline" size={14} color="#6B7280" />
                  <Text style={styles.refreshText}>
                    {t("orders.ridePaymentWait.autoRefresh", "Auto refresh every 15 sec")}
                  </Text>
                </View>
                <Text style={styles.lastChecked}>
                  {t("orders.ridePaymentWait.lastChecked", "Last checked: {{time}}", {
                    time: formatClock(lastCheckedAt.toISOString()),
                  })}
                </Text>
              </View>
            </>
          )}

          <View style={styles.safeCard}>
            <View style={styles.safeIconWrap}>
              <Ionicons name="shield-checkmark" size={20} color={MINT_DARK} />
            </View>
            <View style={styles.safeTextCol}>
              <Text style={styles.safeTitle}>
                {isCashRide
                  ? t(
                      "orders.ridePaymentWait.cashSafeTitle",
                      "Cash goes straight to you."
                    )
                  : t(
                      "orders.ridePaymentWait.safeTitle",
                      "Don't worry, your earnings are safe."
                    )}
              </Text>
              <Text style={styles.safeSub}>
                {isCashRide
                  ? t(
                      "orders.ridePaymentWait.cashSafeSub",
                      "Only the platform's share is recovered from your wallet after you confirm."
                    )
                  : t(
                      "orders.ridePaymentWait.safeSub",
                      "Your earnings will be credited automatically once the passenger completes payment. No action is required from your side."
                    )}
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={handleContactSupport}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons name="headset-outline" size={20} color={MINT_DARK} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitle}>
                  {t("orders.ridePaymentWait.support", "Contact Support")}
                </Text>
                <Text style={styles.actionSub}>
                  {t("orders.ridePaymentWait.supportSub", "Need help?")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, !hasCallablePhone && styles.actionCardDisabled]}
              onPress={handleCallCustomer}
              disabled={!hasCallablePhone}
              activeOpacity={0.85}
            >
              <View style={styles.actionIconWrap}>
                <Ionicons name="call-outline" size={20} color={MINT_DARK} />
              </View>
              <View style={styles.actionTextCol}>
                <Text style={styles.actionTitle}>
                  {t("orders.ridePaymentWait.callCustomer", "Call Customer")}
                </Text>
                <Text style={styles.actionSub}>
                  {hasCallablePhone
                    ? t("orders.ridePaymentWait.callCustomerSub", "Ask about payment")
                    : t("orders.ridePaymentWait.noPhone", "Phone unavailable")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          {isFetching ? (
            <View style={styles.fetchingRow}>
              <ActivityIndicator size="small" color={MINT} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  hero: {
    height: Platform.OS === "ios" ? 200 : 188,
    justifyContent: "flex-end",
  },
  heroImage: {
    resizeMode: "cover",
  },
  heroSafe: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  heroTextWrap: { gap: 4 },
  heroTitle: { fontSize: 28, fontWeight: "900", color: "#fff" },
  heroSub: { fontSize: 14, color: "rgba(255,255,255,0.88)", fontWeight: "600" },
  body: { paddingHorizontal: 16, marginTop: -18, gap: 12 },
  fareCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fareTopRow: { flexDirection: "row", gap: 12 },
  fareLeft: { flex: 1, gap: 4 },
  pendingBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  pendingBadgeText: { fontSize: 10, fontWeight: "800", color: "#B45309" },
  fareAmount: { fontSize: 32, fontWeight: "900", color: "#111827", marginTop: 4 },
  fareLabel: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  rideRef: { fontSize: 11, color: "#9CA3AF", fontWeight: "600", marginTop: 2 },
  timelineCol: { width: 148, paddingTop: 2 },
  timelineRow: { flexDirection: "row", minHeight: 44 },
  timelineRailCol: { width: 18, alignItems: "center" },
  timelineDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotActive: {
    borderWidth: 2,
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  timelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#F59E0B",
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 16,
    marginVertical: 2,
    opacity: 0.45,
  },
  timelineTextCol: { flex: 1, paddingLeft: 6, paddingBottom: 8 },
  timelineTitle: { fontSize: 11, fontWeight: "800" },
  timelineSub: { fontSize: 9, color: "#9CA3AF", marginTop: 1, fontWeight: "500" },
  breakdownCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 6,
  },
  breakdownTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6B7280",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  feeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  feeRowTotal: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  feeRowLabel: { fontSize: 13, color: "#6B7280", fontWeight: "600", flex: 1, paddingRight: 8 },
  feeRowLabelTotal: { fontSize: 14, color: "#111827", fontWeight: "800" },
  feeRowValue: { fontSize: 13, color: "#111827", fontWeight: "700" },
  feeRowValueTotal: { fontSize: 15, color: "#111827", fontWeight: "900" },
  liveCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  liveIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  liveTextCol: { flex: 1, gap: 2 },
  liveTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  liveSub: { fontSize: 12, color: "#6B7280", lineHeight: 17, fontWeight: "500" },
  cashCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cashIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  cashTextCol: { flex: 1, gap: 6 },
  cashTitle: { fontSize: 15, fontWeight: "900", color: "#111827" },
  cashSub: { fontSize: 12, color: "#4B5563", lineHeight: 17, fontWeight: "500" },
  cashCta: {
    marginTop: 6,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: MINT,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 168,
    justifyContent: "center",
  },
  cashCtaDisabled: { opacity: 0.65 },
  cashCtaLabel: { color: "#fff", fontSize: 13, fontWeight: "800" },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  refreshLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  refreshText: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
  lastChecked: { fontSize: 11, color: "#9CA3AF", fontWeight: "500" },
  safeCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  safeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  safeTextCol: { flex: 1, gap: 4 },
  safeTitle: { fontSize: 13, fontWeight: "800", color: "#14532D" },
  safeSub: { fontSize: 12, color: "#166534", lineHeight: 17, fontWeight: "500" },
  actionRow: { flexDirection: "row", gap: 10 },
  actionCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  actionCardDisabled: { opacity: 0.55 },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
  },
  actionTextCol: { flex: 1, gap: 1 },
  actionTitle: { fontSize: 12, fontWeight: "800", color: "#111827" },
  actionSub: { fontSize: 10, color: "#6B7280", fontWeight: "500" },
  fetchingRow: { alignItems: "center", paddingVertical: 4 },
});
