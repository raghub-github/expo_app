/**
 * Post-ride fare checkout — full breakdown, GatiCash, ride offers, Razorpay payment.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { useRouter } from "expo-router";
import { View, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import { HEADER_PADDING_TOP, resolveBottomSafeInset } from "@/constants/layout";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "@/components/RazorpayCheckoutModal";
import { paymentService } from "@/services/payment.service";
import { useProfile } from "@/hooks/useProfile";
import {
  formatRideFare,
  getRideServiceLabel,
  parseRideDeliveredBill,
  buildRidePaymentFareBreakdown,
} from "@/lib/ride-order-display";
import { buildRideCheckoutCompactBill } from "@/lib/ride-fare-bill-display";
import { RideCheckoutBillSummary } from "@/components/ride/RideCheckoutBillSummary";
import { CheckoutGatiCashWalletBar } from "@/components/checkout/CheckoutGatiCashWalletBar";
import { CheckoutOffersSheet } from "@/components/checkout/CheckoutOffersSheet";
import { walletService } from "@/services/wallet.service";
import { addressService } from "@/services/address.service";
import { isRideFareAlreadyPaidError } from "@/lib/ride-fare-gate";
import {
  fetchRideFareCheckoutOffers,
  resolveAppliedRideOfferDiscount,
} from "@/lib/ride-fare-checkout-offers";
import { useLocationStore } from "@/store/locationStore";

const MINT_DARK = GatiMitraColors.deepMintStart;

function roundInr(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

type Props = {
  order: OrderDetail;
  onBack: () => void;
};

export function RideFareCheckoutScreen({ order, onBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const deliveredBill = parseRideDeliveredBill(order);
  const fareBreakdown = useMemo(() => buildRidePaymentFareBreakdown(order), [order]);
  const displayOrderId = order.formattedOrderId ?? order.orderId;
  const rideLabel = getRideServiceLabel(order.rideType);

  const livePincode = useLocationStore((s) => s.address?.pincode ?? null);
  const liveState = useLocationStore((s) => s.address?.state ?? null);
  const liveCity = useLocationStore((s) => s.address?.city ?? null);
  const storeLat = useLocationStore((s) => s.coords?.latitude ?? null);
  const storeLng = useLocationStore((s) => s.coords?.longitude ?? null);
  const liveLat = order.deliveryLat ?? order.pickupLat ?? storeLat;
  const liveLng = order.deliveryLng ?? order.pickupLng ?? storeLng;

  const [payingFare, setPayingFare] = useState(false);
  const [useGatiCashWallet, setUseGatiCashWallet] = useState(false);
  const gatiCashApplyRef = useRef(0);
  const [razorpayVisible, setRazorpayVisible] = useState(false);
  const [razorpayParams, setRazorpayParams] = useState<{
    orderId: string;
    keyId: string;
    amount: number;
  } | null>(null);
  const [simulatedPayment, setSimulatedPayment] = useState<{
    orderId: string;
    amount: number;
  } | null>(null);

  const [offersOpen, setOffersOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [appliedCouponLabel, setAppliedCouponLabel] = useState<string | null>(null);
  const [appliedPlatformOfferId, setAppliedPlatformOfferId] = useState<number | null>(null);
  const [appliedMerchantOfferId, setAppliedMerchantOfferId] = useState<number | null>(null);
  const [forceNoAutoOffer, setForceNoAutoOffer] = useState(false);

  const rideFareBillQ = useQuery({
    queryKey: [
      "ride-fare-bill",
      order.orderId,
      appliedCouponCode,
      appliedPlatformOfferId,
      forceNoAutoOffer,
      fareBreakdown.waitingCharge,
      fareBreakdown.surgeCharge,
    ],
    queryFn: () =>
      orderService.getRideFareBill(order.orderId, {
        couponCode: appliedCouponCode,
        platformOfferId: appliedPlatformOfferId,
        forceNoAutoOffer,
      }),
    staleTime: 0,
    retry: 2,
  });

  const compactBill = useMemo(() => {
    const bill = rideFareBillQ.data;
    if (!bill?.ok) return null;
    return buildRideCheckoutCompactBill(bill, {
      waitingCharge: fareBreakdown.waitingCharge,
      surgeCharge: fareBreakdown.surgeCharge,
    });
  }, [rideFareBillQ.data, fareBreakdown.waitingCharge, fareBreakdown.surgeCharge]);

  const serverDiscountTotal = rideFareBillQ.data?.discountTotal ?? 0;

  useEffect(() => {
    const bill = rideFareBillQ.data;
    if (!bill?.ok || rideFareBillQ.isFetching) return;

    const discounts = bill.discounts ?? [];
    if (discounts.length === 0) {
      if (forceNoAutoOffer) {
        if (appliedPlatformOfferId != null) setAppliedPlatformOfferId(null);
        if (appliedMerchantOfferId != null) setAppliedMerchantOfferId(null);
        if (appliedCouponCode) {
          setAppliedCouponCode(null);
          setAppliedCouponLabel(null);
        }
      }
      return;
    }

    const primary = [...discounts].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
    const meta = ((primary as { meta?: Record<string, unknown> }).meta ?? {}) as Record<string, unknown>;
    const platformId =
      typeof meta.platformOfferId === "number" ? (meta.platformOfferId as number) : null;
    const merchantId =
      typeof meta.merchantOfferId === "number" ? (meta.merchantOfferId as number) : null;
    const couponCode =
      typeof meta.code === "string"
        ? String(meta.code).trim()
        : primary.label?.replace(/^coupon\s+/i, "").trim() || "";

    if (platformId != null) {
      if (appliedPlatformOfferId !== platformId) setAppliedPlatformOfferId(platformId);
      if (appliedMerchantOfferId != null) setAppliedMerchantOfferId(null);
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }
      if (!appliedCouponLabel) setAppliedCouponLabel(primary.label ?? "Ride offer");
      setForceNoAutoOffer(false);
      return;
    }

    if (merchantId != null) {
      if (appliedMerchantOfferId !== merchantId) setAppliedMerchantOfferId(merchantId);
      if (appliedPlatformOfferId != null) setAppliedPlatformOfferId(null);
      if (appliedCouponCode) {
        setAppliedCouponCode(null);
        setAppliedCouponLabel(null);
      }
      if (!appliedCouponLabel) setAppliedCouponLabel(primary.label ?? "Ride offer");
      setForceNoAutoOffer(false);
      return;
    }

    if (couponCode) {
      if (appliedCouponCode?.toUpperCase() !== couponCode.toUpperCase()) {
        setAppliedCouponCode(couponCode);
        setAppliedCouponLabel(primary.label ?? couponCode);
      }
      if (appliedPlatformOfferId != null) setAppliedPlatformOfferId(null);
      if (appliedMerchantOfferId != null) setAppliedMerchantOfferId(null);
      setForceNoAutoOffer(false);
    } else if (!appliedCouponLabel && primary.label) {
      setAppliedCouponLabel(primary.label);
    }
  }, [
    rideFareBillQ.data,
    rideFareBillQ.isFetching,
    forceNoAutoOffer,
    appliedCouponCode,
    appliedCouponLabel,
    appliedPlatformOfferId,
    appliedMerchantOfferId,
  ]);

  const payableTotal = useMemo(() => {
    if (compactBill?.payableTotal != null && compactBill.payableTotal > 0) {
      return compactBill.payableTotal;
    }
    if (rideFareBillQ.data?.ok && rideFareBillQ.data.finalAmount > 0) {
      return rideFareBillQ.data.finalAmount;
    }
    return 0;
  }, [compactBill?.payableTotal, rideFareBillQ.data]);

  const { data: profile } = useProfile();
  const gatiCashBalanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => walletService.getBalance(),
    staleTime: 30_000,
  });

  const addressesQ = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    staleTime: 60_000,
  });

  const checkoutAddressId = useMemo(() => {
    const list = addressesQ.data ?? [];
    if (list.length === 0) return null;
    const preferred =
      list.find((a) => a.isDefault) ??
      list.find((a) => a.isLastUsed) ??
      list[0];
    return preferred?.id ?? null;
  }, [addressesQ.data]);

  const rideOffersQ = useQuery({
    queryKey: [
      "ride-fare-checkout-offers",
      order.orderId,
      fareBreakdown.total,
      liveLat,
      liveLng,
      livePincode,
      liveState,
      liveCity,
      order.merchantPublicStoreId,
      checkoutAddressId,
    ],
    queryFn: () =>
      fetchRideFareCheckoutOffers({
        fareSubtotal: fareBreakdown.total,
        lat: liveLat,
        lng: liveLng,
        pincode: livePincode,
        state: liveState,
        city: liveCity,
        merchantStoreId: order.merchantPublicStoreId ?? null,
        addressId: checkoutAddressId,
      }),
    staleTime: 60_000,
    retry: 2,
  });

  const checkoutOffersData = rideOffersQ.data?.checkoutOffers;
  const featuredOffers = rideOffersQ.data?.featuredOffers ?? [];

  const appliedOfferDiscount = serverDiscountTotal;

  const fareAfterOffers = useMemo(() => Math.max(0, roundInr(payableTotal)), [payableTotal]);

  const gatiCashAvailable = useMemo(() => {
    const raw = gatiCashBalanceQ.data?.available_balance ?? gatiCashBalanceQ.data?.balance ?? 0;
    return Math.max(0, roundInr(raw));
  }, [gatiCashBalanceQ.data?.available_balance, gatiCashBalanceQ.data?.balance]);

  const gatiCashMaxApply = useMemo(() => {
    if (gatiCashAvailable <= 0.005) return 0;
    return Math.min(gatiCashAvailable, Math.max(0, fareAfterOffers));
  }, [gatiCashAvailable, fareAfterOffers]);

  const gatiCashApplyAmount = useMemo(() => {
    if (!useGatiCashWallet || gatiCashMaxApply <= 0.005) return 0;
    return gatiCashMaxApply;
  }, [useGatiCashWallet, gatiCashMaxApply]);

  const toPayAmount = useMemo(
    () => Math.max(0, roundInr(fareAfterOffers - gatiCashApplyAmount)),
    [fareAfterOffers, gatiCashApplyAmount],
  );

  const showGatiCashWalletBar = gatiCashAvailable > 0.005 || gatiCashBalanceQ.isLoading;
  const bottomPad = Math.max(resolveBottomSafeInset(insets.bottom), 12);
  const scrollBottomPad = bottomPad + 120 + (showGatiCashWalletBar ? 72 : 0);

  useEffect(() => {
    gatiCashApplyRef.current = gatiCashApplyAmount;
  }, [gatiCashApplyAmount]);

  const displayOfferLabel = useMemo(() => {
    if (appliedCouponLabel) return appliedCouponLabel;
    const bill = rideFareBillQ.data;
    if (bill?.ok && bill.discounts?.length) {
      const primary = [...bill.discounts].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
      return primary.label?.trim() || "Ride offer";
    }
    return null;
  }, [appliedCouponLabel, rideFareBillQ.data]);

  const appliedDiscountsForSheet = useMemo(() => {
    const rows: Array<{
      label: string;
      amount: number;
      platformOfferId?: number | null;
      merchantOfferId?: number | null;
    }> = [];
    if (appliedOfferDiscount > 0.005) {
      rows.push({
        label: displayOfferLabel ?? appliedCouponLabel ?? "Ride offer",
        amount: appliedOfferDiscount,
        platformOfferId: appliedPlatformOfferId,
        merchantOfferId: appliedMerchantOfferId,
      });
    }
    return rows;
  }, [
    appliedOfferDiscount,
    displayOfferLabel,
    appliedCouponLabel,
    appliedPlatformOfferId,
    appliedMerchantOfferId,
  ]);

  const refreshRidePaymentState = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["my-orders", "active-rides"] });
    await queryClient.invalidateQueries({ queryKey: ["wallet", "balance"] });
  }, [order.orderId, queryClient]);

  const navigatePaymentSuccess = useCallback(
    (amountPaid: number) => {
      router.replace({
        pathname: "/checkout/ride-fare-success",
        params: {
          orderId: order.orderId,
          formattedOrderId: displayOrderId,
          amountPaid: String(roundInr(amountPaid)),
        },
      });
    },
    [router, order.orderId, displayOrderId],
  );

  const finalizeRidePayment = useCallback(
    async (result?: RazorpayPaymentResult) => {
      setPayingFare(true);
      const gatiCashAmount = gatiCashApplyRef.current;
      const totalPaid = roundInr(fareAfterOffers);

      try {
        await orderService.payRideFare(order.orderId, {
          ...(gatiCashAmount > 0.005 ? { gatiCashAmount } : {}),
          ...(appliedCouponCode ? { couponCode: appliedCouponCode } : {}),
          ...(appliedPlatformOfferId != null
            ? { platformOfferId: appliedPlatformOfferId }
            : {}),
          ...(result
            ? {
                razorpayOrderId: result.razorpayOrderId,
                razorpayPaymentId: result.razorpayPaymentId,
                razorpaySignature: result.razorpaySignature,
              }
            : {}),
        });
        await refreshRidePaymentState();
        navigatePaymentSuccess(totalPaid);
      } catch (e) {
        if (isRideFareAlreadyPaidError(e)) {
          await refreshRidePaymentState();
          navigatePaymentSuccess(totalPaid);
          return;
        }
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e as Error)?.message ??
          "Payment could not be confirmed. Please try again.";
        Alert.alert("Payment failed", msg);
      } finally {
        setPayingFare(false);
        setRazorpayVisible(false);
        setRazorpayParams(null);
        setSimulatedPayment(null);
      }
    },
    [
      order.orderId,
      refreshRidePaymentState,
      appliedCouponCode,
      appliedPlatformOfferId,
      fareAfterOffers,
      navigatePaymentSuccess,
    ],
  );

  const handlePayRideFare = useCallback(async () => {
    if (payingFare) return;
    const payable = toPayAmount;
    if (payable <= 0.005) {
      if (gatiCashApplyAmount <= 0.005 && appliedOfferDiscount <= 0.005) {
        Alert.alert("Unavailable", "Ride fare amount is not available.");
        return;
      }
      await finalizeRidePayment();
      return;
    }
    setPayingFare(true);
    try {
      const rz = await paymentService.createRazorpayOrder({
        amountPaise: Math.round(payable * 100),
        receipt: `ride_${order.orderId}`,
      });
      setRazorpayParams({
        orderId: rz.orderId,
        keyId: rz.keyId,
        amount: rz.amount,
      });
      if (rz.keyId === "dummy_key") {
        setSimulatedPayment({ orderId: rz.orderId, amount: rz.amount });
      } else {
        setRazorpayVisible(true);
      }
    } catch {
      Alert.alert("Payment unavailable", "Could not start payment. Please try again.");
    } finally {
      setPayingFare(false);
    }
  }, [
    payingFare,
    toPayAmount,
    gatiCashApplyAmount,
    appliedOfferDiscount,
    order.orderId,
    finalizeRidePayment,
  ]);

  const handleSimulatedPaySuccess = useCallback(() => {
    if (!simulatedPayment) return;
    void finalizeRidePayment({
      razorpayOrderId: simulatedPayment.orderId,
      razorpayPaymentId: `pay_${simulatedPayment.orderId}`,
      razorpaySignature: "simulated_signature",
    });
  }, [simulatedPayment, finalizeRidePayment]);

  const clearOffers = useCallback(() => {
    setAppliedCouponCode(null);
    setAppliedCouponLabel(null);
    setAppliedPlatformOfferId(null);
    setAppliedMerchantOfferId(null);
    setCouponError(null);
    setForceNoAutoOffer(true);
  }, []);

  const hasAppliedOffer =
    !forceNoAutoOffer &&
    (serverDiscountTotal > 0.005 ||
      appliedCouponCode != null ||
      appliedPlatformOfferId != null ||
      appliedMerchantOfferId != null);

  const payButtonLabel =
    toPayAmount <= 0.005 && gatiCashApplyAmount > 0.005
      ? `Pay ${formatRideFare(gatiCashApplyAmount)} with GatiCash`
      : `Pay ${formatRideFare(toPayAmount)}`;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: HEADER_PADDING_TOP }]}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>Ride checkout</AppText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaCard}>
          <AppText style={styles.metaTitle}>{rideLabel} fare</AppText>
          <AppText style={styles.metaSub}>Ride ID: {displayOrderId}</AppText>
        </View>

        <View style={styles.offerCard}>
          <View style={styles.offerAppliedRow}>
            {hasAppliedOffer ? (
              <View style={styles.offerGreenTick}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            ) : (
              <View style={styles.offerCouponIconCircle}>
                <AppText style={styles.offerCouponIconPct}>%</AppText>
              </View>
            )}
            <TouchableOpacity
              style={styles.offerBodyTextCol}
              onPress={() => setOffersOpen(true)}
              activeOpacity={0.85}
            >
              <AppText style={styles.offerAppliedHeadline} numberOfLines={2}>
                {hasAppliedOffer
                  ? displayOfferLabel ?? `Saved ₹${Math.round(appliedOfferDiscount)}`
                  : "Apply ride offers"}
              </AppText>
              {hasAppliedOffer ? (
                <AppText style={styles.offerSubLineMuted}>
                  You save {formatRideFare(appliedOfferDiscount)}
                </AppText>
              ) : (
                <AppText style={styles.offerSub} numberOfLines={1}>
                  Coupons · GatiMitra ride offers
                </AppText>
              )}
              {!hasAppliedOffer ? (
                <AppText style={styles.offersLearnMore}>View all coupons ›</AppText>
              ) : null}
            </TouchableOpacity>
            {hasAppliedOffer ? (
              <TouchableOpacity onPress={clearOffers} hitSlop={8} activeOpacity={0.7}>
                <AppText style={styles.offersRemoveRed}>Remove</AppText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.offersApplyOutline}
                onPress={() => setOffersOpen(true)}
                activeOpacity={0.85}
              >
                <AppText style={styles.offersApplyOutlineText}>APPLY</AppText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.summaryCard}>
          <AppText style={styles.sectionLabel}>BILL SUMMARY</AppText>

          <RideCheckoutBillSummary
            compactBill={compactBill}
            loading={rideFareBillQ.isLoading}
            gatiCashApplyAmount={gatiCashApplyAmount}
          />

          <View style={styles.routeDivider} />

          <View style={styles.toPayRow}>
            <AppText style={styles.toPayLabel}>To pay</AppText>
            <AppText style={styles.toPayValue}>{formatRideFare(toPayAmount)}</AppText>
          </View>

          <View style={styles.routeBlock}>
            <View style={styles.routeRailCol}>
              <View style={styles.routeDotPickup} />
              <View style={styles.routeRail} />
              <View style={styles.routeDotDrop} />
            </View>
            <View style={styles.routeTextCol}>
              <AppText style={styles.routeText} numberOfLines={2}>
                {order.merchantAddress?.trim() || "Pickup"}
              </AppText>
              <AppText style={[styles.routeText, styles.routeTextDrop]} numberOfLines={2}>
                {order.deliveryAddress?.trim() || "Drop"}
              </AppText>
            </View>
          </View>

          <AppText style={styles.methodLine}>
            {toPayAmount <= 0.005 && gatiCashApplyAmount > 0.005
              ? "Paying with GatiCash"
              : `Pay via ${deliveredBill.paymentMethodLabel}`}
          </AppText>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        {showGatiCashWalletBar ? (
          <View style={styles.gatiCashWalletBarWrap}>
            <CheckoutGatiCashWalletBar
              balance={gatiCashAvailable}
              maxApplyAmount={gatiCashMaxApply}
              applyAmount={gatiCashApplyAmount}
              checked={useGatiCashWallet}
              onToggle={() => setUseGatiCashWallet((v) => !v)}
              loading={gatiCashBalanceQ.isLoading}
            />
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.payBtn, payingFare && styles.payBtnDisabled]}
          onPress={() => void handlePayRideFare()}
          disabled={payingFare || rideFareBillQ.isLoading || payableTotal <= 0}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payBtnGradient}
          >
            {payingFare ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="lock-closed" size={18} color="#fff" />
                <AppText style={styles.payBtnText}>{payButtonLabel}</AppText>
                <View style={styles.payBtnChevron}>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </View>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
        <View style={styles.secureRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={GatiMitraColors.textSecondary} />
          <AppText style={styles.secureText}>100% Secure Payments</AppText>
        </View>
      </View>

      <CheckoutOffersSheet
        visible={offersOpen}
        onClose={() => setOffersOpen(false)}
        bottomInset={insets.bottom}
        loading={(rideOffersQ.isLoading || addressesQ.isLoading) && !checkoutOffersData}
        error={rideOffersQ.isError && !checkoutOffersData}
        data={checkoutOffersData}
        cartSubtotal={fareBreakdown.total}
        couponInput={couponInput}
        onCouponInputChange={(v) => {
          setCouponInput(v);
          setCouponError(null);
        }}
        couponError={couponError}
        appliedCouponCode={appliedCouponCode}
        appliedPlatformOfferId={appliedPlatformOfferId}
        appliedMerchantOfferId={appliedMerchantOfferId}
        appliedDiscounts={appliedDiscountsForSheet}
        onApplyCouponCode={(code, description) => {
          const normalized = code.trim();
          if (!normalized || !checkoutOffersData) return;
          const fromBilling = checkoutOffersData.coupons.find(
            (c) => c.code.toLowerCase() === normalized.toLowerCase(),
          );
          const fromFeatured = featuredOffers.find(
            (o) => o.coupon_code?.trim().toLowerCase() === normalized.toLowerCase(),
          );
          const savings =
            fromBilling?.estimatedSavingsInr ??
            (fromFeatured
              ? resolveAppliedRideOfferDiscount({
                  fareSubtotal: fareBreakdown.total,
                  checkoutOffers: checkoutOffersData,
                  featuredOffers,
                  appliedCouponCode: normalized,
                  appliedPlatformOfferId: null,
                  appliedMerchantOfferId: null,
                })
              : 0);
          if (savings <= 0.005) {
            setCouponError("This coupon is not valid for your ride fare.");
            return;
          }
          setAppliedCouponCode(normalized);
          setAppliedCouponLabel(
            description ?? fromBilling?.description ?? fromFeatured?.title ?? normalized,
          );
          setAppliedPlatformOfferId(null);
          setAppliedMerchantOfferId(null);
          setForceNoAutoOffer(false);
          setCouponError(null);
          setOffersOpen(false);
        }}
        onApplyPlatformOffer={(id, name) => {
          if (!checkoutOffersData) return;
          const fromBilling = checkoutOffersData.platformOffers.find((o) => o.id === id);
          const fromFeatured = featuredOffers.find(
            (o) => o.kind === "platform" && o.source_offer_id === id,
          );
          const savings =
            fromBilling?.estimatedSavingsInr ??
            (fromFeatured
              ? resolveAppliedRideOfferDiscount({
                  fareSubtotal: fareBreakdown.total,
                  checkoutOffers: checkoutOffersData,
                  featuredOffers,
                  appliedCouponCode: null,
                  appliedPlatformOfferId: id,
                  appliedMerchantOfferId: null,
                })
              : 0);
          if (savings <= 0.005) {
            setCouponError("This offer is not applicable on your ride fare.");
            return;
          }
          setAppliedCouponCode(null);
          setAppliedMerchantOfferId(null);
          setAppliedPlatformOfferId(id);
          setAppliedCouponLabel(name ?? fromBilling?.name ?? fromFeatured?.title ?? "Offer");
          setForceNoAutoOffer(false);
          setCouponError(null);
          setOffersOpen(false);
        }}
        onApplyMerchantOffer={(id, couponCode) => {
          if (!checkoutOffersData) return;
          const fromBilling = checkoutOffersData.merchantOffers.find((o) => o.id === id);
          const fromFeatured = featuredOffers.find(
            (o) => o.kind === "merchant" && o.source_offer_id === id,
          );
          const savings =
            fromBilling?.estimatedSavingsInr ??
            (fromFeatured
              ? resolveAppliedRideOfferDiscount({
                  fareSubtotal: fareBreakdown.total,
                  checkoutOffers: checkoutOffersData,
                  featuredOffers,
                  appliedCouponCode: couponCode?.trim() ?? null,
                  appliedPlatformOfferId: null,
                  appliedMerchantOfferId: id,
                })
              : 0);
          if (savings <= 0.005) {
            setCouponError("This offer is not applicable on your ride fare.");
            return;
          }
          setAppliedPlatformOfferId(null);
          setAppliedMerchantOfferId(id);
          if (couponCode?.trim()) {
            setAppliedCouponCode(couponCode.trim());
          } else {
            setAppliedCouponCode(null);
          }
          setAppliedCouponLabel(
            fromBilling?.title ?? fromFeatured?.title ?? "Offer",
          );
          setForceNoAutoOffer(false);
          setCouponError(null);
          setOffersOpen(false);
        }}
        onRemoveCoupon={clearOffers}
        onRemovePlatformOffer={clearOffers}
        onRemoveMerchantOffer={clearOffers}
        onRemoveAllOffers={clearOffers}
      />

      <RazorpayCheckoutModal
        visible={razorpayVisible}
        orderParams={razorpayParams}
        prefill={{
          name: profile?.full_name ?? undefined,
          email: profile?.email ?? undefined,
          contact: profile?.mobile_number ?? undefined,
        }}
        themeColor={MINT_DARK}
        onSuccess={(result) => void finalizeRidePayment(result)}
        onCancel={() => {
          setRazorpayVisible(false);
          setRazorpayParams(null);
        }}
      />

      <Modal visible={simulatedPayment != null} transparent animationType="fade">
        <View style={styles.simOverlay}>
          <View style={styles.simCard}>
            <AppText style={styles.simTitle}>Simulate payment</AppText>
            <AppText style={styles.simSub}>Dev mode — mark ride fare as paid.</AppText>
            <TouchableOpacity style={styles.simBtn} onPress={handleSimulatedPaySuccess}>
              <AppText style={styles.simBtnText}>Mark paid</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSimulatedPayment(null)}>
              <AppText style={styles.simCancel}>Cancel</AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: GatiMitraColors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
    marginRight: 32,
  },
  headerSpacer: { width: 0 },
  scroll: { padding: 16, gap: 12 },
  metaCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    gap: 4,
  },
  metaTitle: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  metaSub: { fontSize: 12, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  offerCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
  },
  offerAppliedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  offerGreenTick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: MINT_DARK,
    alignItems: "center",
    justifyContent: "center",
  },
  offerCouponIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#9CA3AF",
    alignItems: "center",
    justifyContent: "center",
  },
  offerCouponIconPct: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  offerBodyTextCol: { flex: 1, gap: 2 },
  offerAppliedHeadline: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    lineHeight: 19,
  },
  offerSubLineMuted: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  offersLearnMore: {
    fontSize: 12,
    fontWeight: "700",
    color: MINT_DARK,
    marginTop: 2,
  },
  offersRemoveRed: {
    fontSize: 13,
    fontWeight: "700",
    color: "#E23744",
    letterSpacing: 0.2,
    paddingTop: 2,
  },
  offersApplyOutline: {
    borderWidth: 1.5,
    borderColor: MINT_DARK,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  offersApplyOutlineText: {
    fontSize: 11,
    fontWeight: "800",
    color: MINT_DARK,
    letterSpacing: 0.4,
  },
  offerSub: { fontSize: 12, color: GatiMitraColors.textSecondary, fontWeight: "500" },
  summaryCard: {
    backgroundColor: GatiMitraColors.cardBg,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    gap: 10,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraColors.textSecondary,
    letterSpacing: 0.6,
  },
  billLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  billLoadingText: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    fontWeight: "600",
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  breakdownRowTotal: { marginTop: 2 },
  breakdownLabel: { fontSize: 14, color: GatiMitraColors.textSecondary, fontWeight: "600", flex: 1 },
  breakdownLabelMuted: { color: GatiMitraColors.textPrimary, fontWeight: "700" },
  breakdownValue: { fontSize: 14, color: GatiMitraColors.textPrimary, fontWeight: "700" },
  breakdownValueMuted: { fontWeight: "800" },
  breakdownDiscount: { fontSize: 14, color: "#2563EB", fontWeight: "700" },
  routeDivider: { height: 1, backgroundColor: GatiMitraColors.border, marginVertical: 4 },
  toPayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toPayLabel: { fontSize: 16, fontWeight: "800", color: GatiMitraColors.textPrimary },
  toPayValue: { fontSize: 22, fontWeight: "900", color: MINT_DARK },
  routeBlock: { flexDirection: "row", gap: 12, marginTop: 4 },
  routeRailCol: { alignItems: "center", width: 14, paddingTop: 4 },
  routeDotPickup: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: MINT_DARK,
  },
  routeRail: { flex: 1, width: 2, backgroundColor: "#CBD5E1", marginVertical: 4 },
  routeDotDrop: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: "#EF4444",
  },
  routeTextCol: { flex: 1, gap: 14 },
  routeText: { fontSize: 13, color: GatiMitraColors.textPrimary, fontWeight: "600", lineHeight: 18 },
  routeTextDrop: { color: GatiMitraColors.textSecondary },
  methodLine: { fontSize: 12, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.cardBg,
    borderTopWidth: 1,
    borderTopColor: GatiMitraColors.border,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  gatiCashWalletBarWrap: { marginBottom: 2 },
  payBtn: { borderRadius: 14, overflow: "hidden" },
  payBtnDisabled: { opacity: 0.7 },
  payBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  payBtnText: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "800", color: "#fff" },
  payBtnChevron: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBottom: 2,
  },
  secureText: { fontSize: 11, color: GatiMitraColors.textSecondary, fontWeight: "600" },
  simOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  simCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  simTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraColors.textPrimary },
  simSub: { fontSize: 13, color: GatiMitraColors.textSecondary },
  simBtn: {
    backgroundColor: MINT_DARK,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  simBtnText: { color: "#fff", fontWeight: "800" },
  simCancel: { textAlign: "center", color: GatiMitraColors.textSecondary, fontWeight: "600" },
});
