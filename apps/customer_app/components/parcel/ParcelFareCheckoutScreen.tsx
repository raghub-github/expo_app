/**
 * Parcel fare checkout — UPI / GatiCash (and cash-to-captain remains available on tracking).
 * Mirrors person-ride post-complete payment so COD customers can switch to online.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  resolveBottomSafeInset,
  resolveTopSafeInset,
  STATUS_BAR_TO_HEADER_GAP,
} from "@/constants/layout";
import type { OrderDetail } from "@/services/order.service";
import { orderService } from "@/services/order.service";
import {
  RazorpayCheckoutModal,
  type RazorpayOrderParams,
  type RazorpayPaymentResult,
} from "@/components/RazorpayCheckoutModal";
import { paymentService } from "@/services/payment.service";
import { walletService } from "@/services/wallet.service";
import { useProfile } from "@/hooks/useProfile";
import { CheckoutGatiCashWalletBar } from "@/components/checkout/CheckoutGatiCashWalletBar";
import { ParcelFarePaymentSuccessSheet } from "@/components/parcel/ParcelFarePaymentSuccessSheet";
import { isRideFareAlreadyPaidError } from "@/lib/ride-fare-gate";

const MINT_DARK = GatiMitraColors.deepMintStart;

function roundInr(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatFareExact(amount: number): string {
  return `₹${roundInr(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Same as exact — pay CTAs must match breakdown (no whole-rupee rounding). */
function formatFare(amount: number): string {
  return formatFareExact(amount);
}

type Props = {
  order: OrderDetail;
  onBack: () => void;
  /** True when route loaded an already-paid order (redirect without success sheet). */
  initiallyPaid?: boolean;
};

export function ParcelFareCheckoutScreen({ order, onBack, initiallyPaid = false }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const displayOrderId = order.formattedOrderId ?? order.orderId;

  const [payingFare, setPayingFare] = useState(false);
  const [useGatiCashWallet, setUseGatiCashWallet] = useState(false);
  const gatiCashApplyRef = useRef(0);
  const [razorpayVisible, setRazorpayVisible] = useState(false);
  const [razorpayParams, setRazorpayParams] = useState<RazorpayOrderParams | null>(null);
  const [simulatedPayment, setSimulatedPayment] = useState<{
    orderId: string;
    amount: number;
  } | null>(null);
  const [successAmount, setSuccessAmount] = useState<number | null>(null);
  const successOpen = successAmount != null;

  const billQ = useQuery({
    queryKey: ["parcel-fare-bill", order.orderId],
    queryFn: () => orderService.getParcelFareBill(order.orderId),
    staleTime: 0,
    retry: 2,
    enabled: !successOpen && !initiallyPaid,
  });

  const gatiCashBalanceQ = useQuery({
    queryKey: ["wallet", "balance"],
    queryFn: () => walletService.getBalance(),
    staleTime: 15_000,
    retry: 1,
  });

  const payableTotal = useMemo(() => {
    const fromBill = billQ.data?.ok ? Number(billQ.data.finalAmount) : NaN;
    if (Number.isFinite(fromBill) && fromBill > 0) return roundInr(fromBill);
    const fromOrder = Number(order.totalAmount);
    return Number.isFinite(fromOrder) && fromOrder > 0 ? roundInr(fromOrder) : 0;
  }, [billQ.data, order.totalAmount]);

  const billLines = useMemo(() => {
    const lines = billQ.data?.ok ? billQ.data.lines ?? [] : [];
    const detail = lines.filter((l) => l.kind !== "total" && Number(l.amount) > 0.005);
    if (detail.length > 0) return detail;
    // Fallback when API has no snapshot lines yet.
    if (payableTotal > 0.005) {
      return [
        {
          key: "parcel_fare",
          label: "Courier fare",
          amount: payableTotal,
          kind: "fare" as const,
        },
      ];
    }
    return [];
  }, [billQ.data, payableTotal]);

  const gatiCashAvailable = useMemo(() => {
    const raw = gatiCashBalanceQ.data?.available_balance ?? gatiCashBalanceQ.data?.balance ?? 0;
    return Math.max(0, roundInr(raw));
  }, [gatiCashBalanceQ.data?.available_balance, gatiCashBalanceQ.data?.balance]);

  const gatiCashMaxApply = useMemo(() => {
    if (gatiCashAvailable <= 0.005) return 0;
    return Math.min(gatiCashAvailable, Math.max(0, payableTotal));
  }, [gatiCashAvailable, payableTotal]);

  const gatiCashApplyAmount = useMemo(() => {
    if (!useGatiCashWallet || gatiCashMaxApply <= 0.005) return 0;
    return gatiCashMaxApply;
  }, [useGatiCashWallet, gatiCashMaxApply]);

  const toPayAmount = useMemo(
    () => Math.max(0, roundInr(payableTotal - gatiCashApplyAmount)),
    [payableTotal, gatiCashApplyAmount]
  );

  useEffect(() => {
    gatiCashApplyRef.current = gatiCashApplyAmount;
  }, [gatiCashApplyAmount]);

  const showGatiCashWalletBar = gatiCashAvailable > 0.005 || gatiCashBalanceQ.isLoading;
  const bottomPad = Math.max(resolveBottomSafeInset(insets.bottom), 12);
  const scrollBottomPad = bottomPad + 120 + (showGatiCashWalletBar ? 72 : 0);
  const payAt = billQ.data?.payAt ?? order.payAt ?? "pickup";

  const refreshPaymentState = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["order", order.orderId] });
    await queryClient.invalidateQueries({ queryKey: ["parcelOrderStatus", order.orderId] });
    await queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    await queryClient.invalidateQueries({ queryKey: ["wallet", "balance"] });
  }, [order.orderId, queryClient]);

  const goToTracking = useCallback(() => {
    router.replace({
      pathname: "/orders/[id]",
      params: { id: order.orderId },
    });
  }, [router, order.orderId]);

  // Opened checkout for an order that is already paid — leave without a success sheet.
  useEffect(() => {
    if (successOpen) return;
    if (!initiallyPaid) return;
    const t = requestAnimationFrame(() => goToTracking());
    return () => cancelAnimationFrame(t);
  }, [initiallyPaid, successOpen, goToTracking]);

  const showPaymentSuccess = useCallback((amountPaid: number) => {
    setSuccessAmount(roundInr(amountPaid));
  }, []);

  const dismissPaymentSuccess = useCallback(() => {
    setSuccessAmount(null);
    void refreshPaymentState().finally(() => {
      goToTracking();
    });
  }, [refreshPaymentState, goToTracking]);

  const finalizePayment = useCallback(
    async (result?: RazorpayPaymentResult) => {
      setPayingFare(true);
      const gatiCashAmount = gatiCashApplyRef.current;
      const totalPaid = roundInr(payableTotal);
      try {
        const paid = await orderService.payParcelFare(order.orderId, {
          ...(gatiCashAmount > 0.005 ? { gatiCashAmount } : {}),
          ...(result
            ? {
                razorpayOrderId: result.razorpayOrderId,
                razorpayPaymentId: result.razorpayPaymentId,
                razorpaySignature: result.razorpaySignature,
              }
            : {}),
        });
        const confirmed =
          paid && typeof paid === "object" && Number((paid as { amountPaid?: number }).amountPaid) > 0
            ? roundInr(Number((paid as { amountPaid: number }).amountPaid))
            : totalPaid;
        showPaymentSuccess(confirmed);
      } catch (e) {
        if (isRideFareAlreadyPaidError(e)) {
          showPaymentSuccess(totalPaid);
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
    [order.orderId, payableTotal, showPaymentSuccess]
  );

  const handlePay = useCallback(async () => {
    if (payingFare) return;
    const payable = toPayAmount;
    if (payable <= 0.005) {
      if (gatiCashApplyAmount <= 0.005) {
        Alert.alert("Unavailable", "Parcel fare amount is not available.");
        return;
      }
      await finalizePayment();
      return;
    }
    setPayingFare(true);
    try {
      const rz = await paymentService.createRazorpayOrder({
        amountPaise: Math.round(payable * 100),
        receipt: `parcel_${order.orderId}`,
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
  }, [payingFare, toPayAmount, gatiCashApplyAmount, order.orderId, finalizePayment]);

  const payButtonLabel =
    toPayAmount <= 0.005 && gatiCashApplyAmount > 0.005
      ? `Pay ${formatFare(gatiCashApplyAmount)} with GatiCash`
      : `Pay ${formatFare(toPayAmount)}`;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View
        style={[
          styles.header,
          { paddingTop: resolveTopSafeInset(insets.top) + STATUS_BAR_TO_HEADER_GAP },
        ]}
      >
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <AppText style={styles.headerTitle}>Parcel checkout</AppText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.metaCard}>
          <AppText style={styles.metaTitle}>Courier fare</AppText>
          <AppText style={styles.metaSub}>Order #{displayOrderId}</AppText>
          <AppText style={styles.metaHint}>
            {payAt === "drop"
              ? "Pay online now, or hand cash to the captain at drop."
              : "Pay online now, or hand cash to the captain at pickup."}
          </AppText>
        </View>

        <View style={styles.breakdownCard}>
          <AppText style={styles.breakdownTitle}>Fare breakdown</AppText>
          {billQ.isLoading ? (
            <ActivityIndicator color={MINT_DARK} style={{ marginVertical: 16 }} />
          ) : (
            <>
              {billLines.map((line) => {
                const isDiscount = line.kind === "discount";
                return (
                  <View key={line.key} style={styles.breakdownRow}>
                    <AppText
                      style={[
                        styles.breakdownLabel,
                        isDiscount && styles.breakdownDiscountLabel,
                      ]}
                      numberOfLines={2}
                    >
                      {line.label}
                    </AppText>
                    <AppText
                      style={[
                        styles.breakdownAmount,
                        isDiscount && styles.breakdownDiscountAmount,
                      ]}
                    >
                      {isDiscount
                        ? `-${formatFareExact(line.amount)}`
                        : formatFareExact(line.amount)}
                    </AppText>
                  </View>
                );
              })}
              <View style={styles.breakdownDivider} />
              <View style={styles.breakdownRow}>
                <AppText style={styles.breakdownTotalLabel}>Total fare</AppText>
                <AppText style={styles.breakdownTotalAmount}>
                  {formatFareExact(payableTotal)}
                </AppText>
              </View>
            </>
          )}
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={MINT_DARK} />
          <AppText style={styles.infoText}>
            You booked cash, but you can still pay online with UPI or GatiCash if you do not have
            cash ready.
          </AppText>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        {showGatiCashWalletBar ? (
          <View style={styles.walletWrap}>
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
          onPress={() => void handlePay()}
          disabled={payingFare || payableTotal <= 0}
          activeOpacity={0.88}
        >
          {payingFare ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <AppText style={styles.payBtnText}>{payButtonLabel}</AppText>
          )}
        </TouchableOpacity>
      </View>

      <RazorpayCheckoutModal
        visible={razorpayVisible}
        orderParams={razorpayParams}
        prefill={{
          name: profile?.full_name ?? undefined,
          email: profile?.email ?? undefined,
          contact: profile?.mobile_number ?? undefined,
        }}
        themeColor={MINT_DARK}
        description="Complete your parcel payment"
        onSuccess={(result) => void finalizePayment(result)}
        onCancel={() => {
          setRazorpayVisible(false);
          setRazorpayParams(null);
        }}
      />

      <Modal visible={simulatedPayment != null} transparent animationType="fade">
        <View style={styles.simOverlay}>
          <View style={styles.simCard}>
            <AppText style={styles.simTitle}>Simulate payment</AppText>
            <AppText style={styles.simBody}>
              Dev mode — confirm {formatFare((simulatedPayment?.amount ?? 0) / 100)}?
            </AppText>
            <View style={styles.simRow}>
              <TouchableOpacity
                style={styles.simCancel}
                onPress={() => setSimulatedPayment(null)}
              >
                <AppText style={styles.simCancelText}>Cancel</AppText>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.simOk}
                onPress={() => {
                  if (!simulatedPayment) return;
                  void finalizePayment({
                    razorpayOrderId: simulatedPayment.orderId,
                    razorpayPaymentId: `pay_${simulatedPayment.orderId}`,
                    razorpaySignature: "simulated_signature",
                  });
                }}
              >
                <AppText style={styles.simOkText}>Pay</AppText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ParcelFarePaymentSuccessSheet
        visible={successOpen}
        amountPaid={successAmount ?? 0}
        orderLabel={displayOrderId}
        onClose={dismissPaymentSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F1F5F9" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: "#111827" },
  headerSpacer: { width: 40 },
  scroll: { padding: 16, gap: 12 },
  metaCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  metaTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  metaSub: { marginTop: 4, fontSize: 13, fontWeight: "600", color: "#6B7280" },
  metaHint: { marginTop: 8, fontSize: 13, color: "#4B5563", lineHeight: 18 },
  breakdownCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 10,
  },
  breakdownTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    lineHeight: 20,
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  breakdownDiscountLabel: { color: "#2563EB" },
  breakdownDiscountAmount: { color: "#2563EB" },
  breakdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginVertical: 4,
  },
  breakdownTotalLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  breakdownTotalAmount: {
    fontSize: 17,
    fontWeight: "900",
    color: MINT_DARK,
  },
  infoCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  infoText: { flex: 1, fontSize: 13, color: "#166534", lineHeight: 18 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  walletWrap: { marginBottom: 10 },
  payBtn: {
    backgroundColor: MINT_DARK,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  payBtnDisabled: { opacity: 0.65 },
  payBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  simOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  simCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
  },
  simTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  simBody: { marginTop: 8, fontSize: 14, color: "#4B5563" },
  simRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  simCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  simCancelText: { fontWeight: "700", color: "#374151" },
  simOk: {
    flex: 1,
    backgroundColor: MINT_DARK,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  simOkText: { fontWeight: "800", color: "#fff" },
});
