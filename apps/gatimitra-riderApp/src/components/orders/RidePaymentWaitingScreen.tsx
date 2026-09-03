// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from "react-native";
import { AppText } from "@/components/AppText";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@gatimitra/sdk";
import { riderApi } from "@/src/services/api/riderApi";
import { buildRideDeliverySuccessParams } from "@/src/lib/ride-delivery-success-nav";
import { isRideFarePaymentSettled } from "@/src/lib/ride-payment-wait";
import { buildRiderRideEarningBreakdown } from "@/src/lib/rider-earning-display";
import { RIDER_ACTIVE_ORDERS_QUERY_KEY, RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY } from "@/src/hooks/useOrders";
import { CustomerCallBottomSheet } from "@/src/components/orders/CustomerCallBottomSheet";
import { RideCashCollectBottomSheet } from "@/src/components/orders/RideCashCollectBottomSheet";
import { RideOnlineQrBottomSheet } from "@/src/components/orders/RideOnlineQrBottomSheet";
import { LORA_BOLD, LORA_REGULAR, LORA_SEMIBOLD, POPPINS_BOLD, POPPINS_SEMIBOLD } from "@/src/theme/headerFonts";
import { colors } from "@/src/theme";

function riderApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload;
    if (payload && typeof payload === "object" && "error" in payload) {
      const msg = String((payload as { error?: string }).error ?? "").trim();
      if (msg) return msg;
    }
    return err.message || fallback;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

const POLL_MS = 15_000;
const MINT = colors.primary[600];
const MINT_DARK = colors.primary[700];
/** Matches customer app Place Order CTA (`CHECKOUT_CTA_GREEN`). */
const BRAND_BTN = "#137243";

const CARD_GAP = 16;
const BANNER_ROTATE_MS = 8000;

type SafeBannerSlide = {
  id: string;
  title: string;
  subtitle: string;
};

function HeaderSafeBannerCarousel({ slides }: { slides: SafeBannerSlide[] }) {
  const { width } = useWindowDimensions();
  const bannerWidth = Math.max(0, width - 32);
  const listRef = useRef<FlatList<SafeBannerSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setTimeout(() => {
      const next = (activeIndex + 1) % slides.length;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    }, BANNER_ROTATE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeIndex, slides.length]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (bannerWidth <= 0) return;
      const idx = Math.round(e.nativeEvent.contentOffset.x / bannerWidth);
      setActiveIndex(Math.max(0, Math.min(idx, slides.length - 1)));
    },
    [bannerWidth, slides.length]
  );

  if (slides.length === 0) return null;

  return (
    <View style={bannerStyles.wrap}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={onScrollEnd}
        getItemLayout={(_, index) => ({
          length: bannerWidth,
          offset: bannerWidth * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={[bannerStyles.slide, { width: bannerWidth }]}>
            <View style={bannerStyles.iconWrap}>
              <Ionicons name="shield-checkmark" size={18} color={MINT_DARK} />
            </View>
            <View style={bannerStyles.textCol}>
              <AppText style={bannerStyles.title} bold>
                {item.title}
              </AppText>
              <AppText style={bannerStyles.sub}>{item.subtitle}</AppText>
            </View>
          </View>
        )}
      />
      {slides.length > 1 ? (
        <View style={bannerStyles.dots}>
          {slides.map((slide, i) => (
            <View
              key={slide.id}
              style={[bannerStyles.dot, i === activeIndex ? bannerStyles.dotActive : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: { marginTop: 12 },
  slide: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    padding: 12,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontFamily: LORA_BOLD, color: "#14532D" },
  sub: { fontSize: 12, fontFamily: LORA_REGULAR, color: "#166534", lineHeight: 17 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
    marginTop: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#BBF7D0",
  },
  dotActive: {
    width: 14,
    backgroundColor: MINT_DARK,
  },
});

function isCashRideOrder(order: unknown): boolean {
  const method = String(
    (order as { paymentMethod?: string })?.paymentMethod ?? ""
  )
    .trim()
    .toLowerCase();
  return method === "cash" || method === "cod";
}

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
        <AppText style={[styles.timelineTitle, { color: titleColor }]} bold>
          {step.title}
        </AppText>
        {step.subtitle ? <AppText style={styles.timelineSub}>{step.subtitle}</AppText> : null}
      </View>
    </View>
  );
}

export function RidePaymentWaitingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const bottomInset = useRiderBottomInset();
  const params = useLocalSearchParams<{ orderId?: string; displayId?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  const [lastCheckedAt, setLastCheckedAt] = useState(() => new Date());
  const [callSheetOpen, setCallSheetOpen] = useState(false);
  const [cashSheetOpen, setCashSheetOpen] = useState(false);
  const [onlineSheetOpen, setOnlineSheetOpen] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const { data: order } = useQuery({
    queryKey: ["rider", "orders", "detail", orderId],
    queryFn: async () => {
      const row = await riderApi.getRideOrder(orderId);
      setLastCheckedAt(new Date());
      return row;
    },
    enabled: orderId.length > 0,
    refetchInterval: (query) => {
      const row = query.state.data;
      if (!row || isRideFarePaymentSettled(row)) return false;
      if (row.paymentRequired === false) return false;
      if (typeof row.customerPayable === "number" && row.customerPayable <= 0.005) return false;
      const cash = isCashRideOrder(row);
      return cash ? false : POLL_MS;
    },
    refetchIntervalInBackground: false,
  });

  const isCashRide = useMemo(() => isCashRideOrder(order), [order]);

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
    setOnlineSheetOpen(false);
    setCashSheetOpen(false);
    goToSuccess(order);
  }, [order, goToSuccess]);

  const cashMutation = useMutation({
    mutationFn: async () => {
      try {
        await riderApi.selectRidePaymentMethod(orderId, "cash");
      } catch (err) {
        const code =
          err instanceof ApiError &&
          err.payload &&
          typeof err.payload === "object" &&
          "code" in err.payload
            ? String((err.payload as { code?: string }).code ?? "")
            : "";
        if (!(err instanceof ApiError && err.status === 409 && code === "ALREADY_SETTLED")) {
          throw err;
        }
      }
      return riderApi.confirmRideCashCollected(orderId);
    },
    onSuccess: async () => {
      setCashSheetOpen(false);
      void queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: RIDER_RIDE_PAYMENT_HOLDS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ["rider", "orders", "detail", orderId] });
      const refreshed = await riderApi.getRideOrder(orderId);
      goToSuccess(refreshed);
    },
    onError: (err) => {
      Alert.alert(
        t("common.error", "Something went wrong"),
        riderApiErrorMessage(
          err,
          t(
            "orders.ridePaymentWait.cashError",
            "Could not confirm the cash collection. Please try again."
          )
        )
      );
    },
  });

  const [qrInfo, setQrInfo] = useState<{ qrImageUrl: string; amount: number } | null>(null);

  const qrMutation = useMutation({
    mutationFn: async () => riderApi.createRideOnlineQr(orderId),
    onSuccess: (data) => {
      setQrError(null);
      setQrInfo({ qrImageUrl: data.qrImageUrl, amount: data.amount });
    },
    onError: (err) => {
      const message = String(
        (err as { message?: string })?.message ??
          t("orders.ridePaymentWait.qrError", "Could not create the payment QR. Please try again.")
      );
      setQrError(message);
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (method: "cash" | "online") =>
      riderApi.selectRidePaymentMethod(orderId, method),
    onSuccess: async (_res, method) => {
      await queryClient.invalidateQueries({ queryKey: ["rider", "orders", "detail", orderId] });
      if (method === "online") {
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

  const openCashSheet = useCallback(() => {
    setCashSheetOpen(true);
    if (!isCashRide && !selectMutation.isPending && !cashMutation.isPending) {
      selectMutation.mutate("cash");
    }
  }, [cashMutation.isPending, isCashRide, selectMutation]);

  const openOnlineSheet = useCallback(() => {
    setOnlineSheetOpen(true);
    setQrError(null);
    if (isCashRide) {
      selectMutation.mutate("online");
      return;
    }
    if (!qrInfo && !qrMutation.isPending) {
      selectMutation.mutate("online");
    }
  }, [isCashRide, qrInfo, qrMutation.isPending, selectMutation]);

  const handleCashCompleted = useCallback(() => {
    if (cashMutation.isPending) return;
    cashMutation.mutate();
  }, [cashMutation]);

  const displayId = params.displayId?.trim() || order?.formattedOrderId || orderId;
  const earningBreakdown = useMemo(
    () => buildRiderRideEarningBreakdown(order, t),
    [order, t]
  );
  const riderReceives = earningBreakdown.totalEarning;
  const customerPays = useMemo(() => {
    const fromPayable = Number(order?.customerPayable);
    if (Number.isFinite(fromPayable) && fromPayable >= 0 && order?.customerPayable != null) {
      return Math.round(fromPayable * 100) / 100;
    }
    const fromOrder = Number(
      (order as { totalAmount?: number; grandTotal?: number })?.totalAmount ??
        (order as { grandTotal?: number })?.grandTotal ??
        0
    );
    if (Number.isFinite(fromOrder) && fromOrder >= 0) return Math.round(fromOrder * 100) / 100;
    return 0;
  }, [order]);
  const companyKeeps = Math.max(0, customerPays - riderReceives);
  const fareAmount = customerPays;
  const collectPaymentRequired = customerPays > 0.005 && order?.paymentRequired !== false;
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
  const customerDisplayName =
    order?.customerName?.trim() ||
    order?.customerPrimaryName?.trim() ||
    t("orders.ridePaymentWait.passengerFallback", "Passenger");

  const handleOpenCallSheet = useCallback(() => {
    setCallSheetOpen(true);
  }, []);

  const safeBannerSlides = useMemo<SafeBannerSlide[]>(() => {
    if (isCashRide) {
      return [
        {
          id: "cash-safe",
          title: t("orders.ridePaymentWait.cashSafeTitle", "Cash goes straight to you."),
          subtitle: t(
            "orders.ridePaymentWait.cashSafeSub",
            "Only the platform's share is recovered from your wallet after you confirm."
          ),
        },
      ];
    }
    const slides: SafeBannerSlide[] = [
      {
        id: "safe",
        title: t("orders.ridePaymentWait.safeTitle", "Don't worry, your earnings are safe."),
        subtitle: t(
          "orders.ridePaymentWait.safeSub",
          "Your earnings will be credited automatically once the passenger completes payment. No action is required from your side."
        ),
      },
    ];
    if (!isCashRide) {
      slides.push({
        id: "refresh",
        title: t("orders.ridePaymentWait.autoRefresh", "Auto refresh every 15 sec"),
        subtitle: t("orders.ridePaymentWait.lastChecked", "Last checked: {{time}}", {
          time: formatClock(lastCheckedAt.toISOString()),
        }),
      });
    }
    return slides;
  }, [isCashRide, lastCheckedAt, t]);

  const handleContactSupport = useCallback(() => {
    router.push("/raise-ticket");
  }, []);

  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerSafe}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={handleContactSupport}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("orders.ridePaymentWait.support", "Contact Support")}
            >
              <Ionicons name="headset-outline" size={22} color={MINT_DARK} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={handleOpenCallSheet}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("orders.ridePaymentWait.callCustomer", "Call Customer")}
            >
              <Ionicons
                name="call-outline"
                size={22}
                color={hasCallablePhone ? MINT_DARK : "#9CA3AF"}
              />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.headerTitleWrap}>
          <AppText style={styles.pageTitle} bold>
            {t("orders.ridePaymentWait.heroTitle", "Fare Pending")}
          </AppText>
          <AppText style={styles.pageSub}>
            {t("orders.ridePaymentWait.heroSub", "Waiting for passenger payment")}
          </AppText>
        </View>
        <HeaderSafeBannerCarousel slides={safeBannerSlides} />
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.body}>
          <View style={styles.summarySection}>
          <View style={styles.fareCard}>
            <View style={styles.fareTopRow}>
              <View style={styles.fareLeft}>
                <View style={styles.pendingBadge}>
                  <Ionicons name="hourglass-outline" size={12} color="#B45309" />
                  <AppText style={styles.pendingBadgeText} bold>
                    {t("orders.ridePaymentWait.badge", "Payment Pending")}
                  </AppText>
                </View>
                <AppText style={styles.fareAmount} bold>{formatFare(fareAmount)}</AppText>
                <AppText style={styles.fareLabel}>
                  {t("orders.ridePaymentWait.fareLabel", "Fare to be received")}
                </AppText>
                {displayId ? (
                  <AppText style={styles.rideRef}>
                    {t("orders.ridePaymentWait.rideRef", "Ride #{{id}}", { id: displayId })}
                  </AppText>
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
            <AppText style={styles.breakdownTitle} bold>
              {t("orders.ridePaymentWait.settlementTitle", "Settlement summary")}
            </AppText>
            <View style={styles.feeRow}>
              <AppText style={styles.feeRowLabel}>
                {t("orders.ridePaymentWait.customerPays", "Customer Pays")}
              </AppText>
              <AppText style={styles.feeRowValue} bold>{formatFare(customerPays)}</AppText>
            </View>
            <View style={styles.feeRow}>
              <AppText style={styles.feeRowLabel}>
                {t("orders.ridePaymentWait.riderReceives", "Rider Receives")}
              </AppText>
              <AppText style={[styles.feeRowValue, styles.feeRowValueMint]} bold>
                {formatFare(riderReceives)}
              </AppText>
            </View>
            <View style={[styles.feeRow, styles.feeRowTotal]}>
              <AppText style={[styles.feeRowLabel, styles.feeRowLabelTotal]} bold>
                {t("orders.ridePaymentWait.companyKeeps", "Company Keeps")}
              </AppText>
              <AppText style={[styles.feeRowValue, styles.feeRowValueTotal]} bold>
                {formatFare(companyKeeps)}
              </AppText>
            </View>
          </View>

          <View style={styles.breakdownCard}>
            <AppText style={styles.breakdownTitle} bold>
              {t("orders.ridePaymentWait.breakdownTitle", "Earnings breakdown")}
            </AppText>
            {earningBreakdown.lines.map((line, idx) => (
              <View
                key={line.label}
                style={[styles.feeRow, line.emphasis && styles.feeRowTotal]}
              >
                <AppText style={[styles.feeRowLabel, line.emphasis && styles.feeRowLabelTotal]} bold={line.emphasis}>
                  {line.label}
                </AppText>
                <AppText style={[styles.feeRowValue, line.emphasis && styles.feeRowValueTotal]} bold={line.emphasis || idx === 0}>
                  {line.emphasis || idx === 0
                    ? formatFare(line.amount)
                    : `+ ${formatFare(line.amount)}`}
                </AppText>
              </View>
            ))}
          </View>
          </View>
        </View>
      </ScrollView>

      {collectPaymentRequired ? (
      <View style={[styles.paymentFooter, { paddingBottom: 12 + bottomInset }]}>
            <View style={styles.cashCard}>
              <View style={styles.cashTextCol}>
                <AppText style={styles.cashTitle} bold>
                  {isCashRide
                    ? t(
                        "orders.ridePaymentWait.cashTitle",
                        "Collect {{amount}} in cash",
                        { amount: formatFare(fareAmount) }
                      )
                    : t(
                        "orders.ridePaymentWait.chooseTitle",
                        "Collect {{amount}} — how is the passenger paying?",
                        { amount: formatFare(fareAmount) }
                      )}
                </AppText>
                <AppText style={styles.cashSub}>
                  {isCashRide
                    ? t(
                        "orders.ridePaymentWait.cashSub",
                        "Company share (≈ {{company}}) will be deducted from your wallet; you keep {{rider}}.",
                        {
                          company: formatFare(companyKeeps),
                          rider: formatFare(riderReceives),
                        }
                      )
                    : t(
                        "orders.ridePaymentWait.chooseSub",
                        "Cash if they hand you money, or Online to show a UPI QR."
                      )}
                </AppText>
                <View style={styles.payBtnRow}>
                  {isCashRide ? (
                    <TouchableOpacity
                      style={[styles.payMethodBtn, { flex: 1 }, cashMutation.isPending && styles.payMethodBtnDisabled]}
                      onPress={openCashSheet}
                      disabled={cashMutation.isPending}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={t("orders.ridePaymentWait.cashCta", "Cash received")}
                    >
                      <Ionicons name="cash-outline" size={18} color="#fff" />
                      <AppText style={styles.payMethodBtnLabel} bold>
                        {t("orders.ridePaymentWait.cashCta", "Cash received")}
                      </AppText>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.payMethodBtn, { flex: 1 }]}
                        onPress={openCashSheet}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={t("orders.ridePaymentWait.chooseCash", "Cash")}
                      >
                        <Ionicons name="cash-outline" size={18} color="#fff" />
                        <AppText style={styles.payMethodBtnLabel} bold>
                          {t("orders.ridePaymentWait.chooseCash", "Cash")}
                        </AppText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.payMethodBtn, { flex: 1 }]}
                        onPress={openOnlineSheet}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel={t("orders.ridePaymentWait.chooseOnline", "Online")}
                      >
                        <Ionicons name="qr-code-outline" size={18} color="#fff" />
                        <AppText style={styles.payMethodBtnLabel} bold>
                          {t("orders.ridePaymentWait.chooseOnline", "Online")}
                        </AppText>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </View>
      </View>
      ) : null}

      <CustomerCallBottomSheet
        visible={callSheetOpen}
        onDismiss={() => setCallSheetOpen(false)}
        customerName={customerDisplayName}
        customerPhone={order?.customerPhone}
        customerPrimaryPhone={order?.customerPrimaryPhone}
        customerAlternatePhone={order?.customerAlternatePhone}
        customerPhoneMasked={order?.customerPhoneMasked}
        customerPrimaryPhoneMasked={order?.customerPrimaryPhoneMasked}
        customerAlternatePhoneMasked={order?.customerAlternatePhoneMasked}
      />

      <RideCashCollectBottomSheet
        visible={collectPaymentRequired && cashSheetOpen}
        onDismiss={() => setCashSheetOpen(false)}
        amountLabel={formatFare(fareAmount)}
        loading={cashMutation.isPending}
        onConfirm={handleCashCompleted}
      />

      <RideOnlineQrBottomSheet
        visible={collectPaymentRequired && onlineSheetOpen}
        onDismiss={() => setOnlineSheetOpen(false)}
        amountLabel={formatFare(qrInfo?.amount ?? fareAmount)}
        qrImageUrl={qrInfo?.qrImageUrl}
        loading={selectMutation.isPending || qrMutation.isPending}
        errorMessage={qrError}
        onRetry={() => {
          setQrError(null);
          qrMutation.mutate();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },
  headerSafe: {
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  headerIconBtnDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#E5E7EB",
  },
  headerTitleWrap: {
    marginTop: 8,
    gap: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontFamily: LORA_BOLD,
    color: "#111827",
  },
  pageSub: {
    fontSize: 14,
    fontFamily: LORA_SEMIBOLD,
    color: "#6B7280",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 16 },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  body: { paddingHorizontal: 16, paddingTop: 14 },
  summarySection: { gap: CARD_GAP },
  paymentFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#F3F4F6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
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
  pendingBadgeText: { fontSize: 10, fontFamily: LORA_BOLD, color: "#B45309" },
  fareAmount: { fontSize: 32, fontFamily: POPPINS_BOLD, color: "#111827", marginTop: 4 },
  fareLabel: { fontSize: 12, fontFamily: LORA_SEMIBOLD, color: "#6B7280" },
  rideRef: { fontSize: 11, fontFamily: LORA_SEMIBOLD, color: "#9CA3AF", marginTop: 2 },
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
  timelineTitle: { fontSize: 11, fontFamily: LORA_BOLD },
  timelineSub: { fontSize: 9, fontFamily: LORA_REGULAR, color: "#9CA3AF", marginTop: 1 },
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
    fontFamily: LORA_BOLD,
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
  feeRowLabel: { fontSize: 13, fontFamily: LORA_SEMIBOLD, color: "#6B7280", flex: 1, paddingRight: 8 },
  feeRowLabelTotal: { fontSize: 14, fontFamily: LORA_BOLD, color: "#111827" },
  feeRowValue: { fontSize: 13, fontFamily: POPPINS_SEMIBOLD, color: "#111827" },
  feeRowValueMint: { color: MINT_DARK },
  feeRowValueTotal: { fontSize: 15, fontFamily: POPPINS_BOLD, color: "#111827" },
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
  cashTitle: { fontSize: 15, fontFamily: LORA_BOLD, color: "#111827" },
  cashSub: { fontSize: 12, fontFamily: LORA_REGULAR, color: "#4B5563", lineHeight: 17 },
  payMethodBtn: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND_BTN,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  payMethodBtnDisabled: { opacity: 0.65 },
  payMethodBtnLabel: { color: "#fff", fontSize: 13, fontFamily: LORA_BOLD },
  payBtnRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  refreshLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  refreshText: { fontSize: 11, color: "#6B7280", fontWeight: "600" },
  lastChecked: { fontSize: 11, color: "#9CA3AF", fontWeight: "500" },
});
