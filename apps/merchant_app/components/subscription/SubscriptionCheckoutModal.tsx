/**
 * Subscription checkout modal — payment method chooser + execution.
 *
 * Flow:
 *   1. Merchant taps "Upgrade to <plan>" in plans.tsx.
 *   2. This modal fetches the plan/order details via create-payment-order,
 *      which returns amountToCharge + walletAvailableBalance in one call.
 *   3. Merchant picks Razorpay (default) or Wallet (enabled iff balance ≥ amount).
 *   4. Razorpay branch → hosted checkout (RazorpayCheckoutModal) → verify-payment.
 *      Wallet branch → pay-with-wallet.
 *   5. On success both branches call onSuccess({ subscriptionId }).
 *
 * The modal is intentionally the ONLY place that knows about the split — plans.tsx
 * just opens it and awaits onSuccess/onClose. Keeps the payment source
 * abstraction inside one component.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  createSubscriptionPaymentOrder,
  payMerchantSubscriptionWithWallet,
  verifySubscriptionPayment,
  type CreateSubscriptionOrderResponse,
} from "@/services/subscriptionPaymentApi";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "./RazorpayCheckoutModal";

type Props = {
  visible: boolean;
  storeId: number;
  planId: number;
  planName: string;
  token: string;
  prefill?: { contact?: string | null; email?: string | null; name?: string | null };
  onSuccess: (result: { subscriptionId?: number; via: "wallet" | "razorpay" | "skipped" }) => void;
  onClose: () => void;
};

type Method = "razorpay" | "wallet";

const GREEN = "#16A34A";
const GREEN_DARK = "#15803D";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const DANGER = "#DC2626";
const TEXT = "#111827";

function inr(rupees: number | undefined | null): string {
  const n = Number(rupees ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function SubscriptionCheckoutModal({
  visible,
  storeId,
  planId,
  planName,
  token,
  prefill,
  onSuccess,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [order, setOrder] = useState<CreateSubscriptionOrderResponse | null>(null);
  const [method, setMethod] = useState<Method>("razorpay");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [razorpayVisible, setRazorpayVisible] = useState(false);

  const amountRupees = Number(order?.amountToCharge ?? 0);
  const walletBalance = Number(order?.walletAvailableBalance ?? 0);
  const walletSufficient = walletBalance + 0.001 >= amountRupees;
  const isSkipPayment = order?.skipPayment === true;

  // Load order details when the modal opens. Fresh fetch on every open so the
  // wallet balance is not stale (merchant may have earned since last visit).
  const loadOrder = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setOrder(null);
    setPayError(null);
    try {
      const res = await createSubscriptionPaymentOrder(storeId, token, planId);
      setOrder(res);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load plan");
    } finally {
      setLoading(false);
    }
  }, [storeId, token, planId]);

  useEffect(() => {
    if (!visible) {
      setOrder(null);
      setLoadError(null);
      setPayError(null);
      setPaying(false);
      setRazorpayVisible(false);
      setMethod("razorpay");
      return;
    }
    void loadOrder();
  }, [visible, loadOrder]);

  // If the merchant lands with wallet insufficient, keep default = Razorpay.
  // If wallet has enough, keep default = Razorpay too (per product spec — user
  // must actively opt in to spend earnings). Only auto-flip on error.

  const handleRazorpaySuccess = useCallback(
    async (tokens: RazorpayPaymentResult) => {
      setRazorpayVisible(false);
      setPaying(true);
      setPayError(null);
      try {
        await verifySubscriptionPayment(storeId, token, {
          planId,
          razorpay_order_id: tokens.razorpayOrderId,
          razorpay_payment_id: tokens.razorpayPaymentId,
          razorpay_signature: tokens.razorpaySignature,
        });
        onSuccess({ via: "razorpay" });
      } catch (e) {
        setPayError(
          e instanceof Error ? e.message : "Payment verification failed. Please contact support."
        );
      } finally {
        setPaying(false);
      }
    },
    [storeId, token, planId, onSuccess]
  );

  const handlePay = useCallback(async () => {
    if (paying || !order) return;
    setPayError(null);

    // Zero-amount case (fully credit-covered upgrade) — activate straight away.
    if (isSkipPayment) {
      setPaying(true);
      try {
        // Use verifyMerchantSubscriptionPayment's zero-charge path via upgrade
        // would need a distinct call; simplest for now: tell caller to route
        // through activate-free / upgrade skip on their side. Emitting via=skipped.
        onSuccess({ via: "skipped" });
      } finally {
        setPaying(false);
      }
      return;
    }

    if (method === "wallet") {
      if (!walletSufficient) {
        setPayError(
          `Wallet balance is short. You need ${inr(amountRupees)}, wallet has ${inr(walletBalance)}.`
        );
        return;
      }
      setPaying(true);
      try {
        const res = await payMerchantSubscriptionWithWallet(storeId, token, planId);
        if (!res.success) {
          if (res.error === "wallet_insufficient") {
            setPayError(
              `Wallet balance is short. You need ${inr(res.required)}, wallet has ${inr(res.available)}.`
            );
          } else {
            setPayError(res.error ?? "Wallet payment failed");
          }
          return;
        }
        onSuccess({ subscriptionId: res.subscriptionId, via: "wallet" });
      } catch (e) {
        setPayError(e instanceof Error ? e.message : "Wallet payment failed");
      } finally {
        setPaying(false);
      }
      return;
    }

    // Razorpay branch — open hosted checkout. Verification happens in onSuccess.
    if (!order.orderId || !order.keyId || !order.amount) {
      setPayError("Payment gateway is not configured. Please try again later.");
      return;
    }
    setRazorpayVisible(true);
  }, [paying, order, isSkipPayment, method, walletSufficient, walletBalance, amountRupees, storeId, token, planId, onSuccess]);

  return (
    <>
      <Modal visible={visible && !razorpayVisible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.header}>
              <Text style={styles.title}>Confirm subscription</Text>
              <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={MUTED} />
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color={GREEN} />
                <Text style={styles.loadingText}>Loading plan…</Text>
              </View>
            ) : loadError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={22} color={DANGER} />
                <Text style={styles.errorText}>{loadError}</Text>
                <Pressable onPress={loadOrder} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : order ? (
              <>
                <View style={styles.summary}>
                  <Text style={styles.summaryLabel}>Plan</Text>
                  <Text style={styles.summaryValue}>{planName}</Text>
                  {order.isUpgrade && Number(order.creditApplied ?? 0) > 0 ? (
                    <Text style={styles.summarySub}>
                      Proration credit: {inr(order.creditApplied)}
                    </Text>
                  ) : null}
                  <Text style={[styles.summaryLabel, { marginTop: 12 }]}>Amount</Text>
                  <Text style={styles.summaryAmount}>{inr(amountRupees)}</Text>
                  {order.gstPercent && order.gstPercent > 0 && !isSkipPayment ? (
                    <Text style={styles.summarySub}>Inclusive of {order.gstPercent}% GST</Text>
                  ) : null}
                </View>

                {!isSkipPayment ? (
                  <View style={styles.methodsBlock}>
                    <Text style={styles.methodsLabel}>Pay with</Text>

                    <Pressable
                      onPress={() => setMethod("razorpay")}
                      style={[styles.methodRow, method === "razorpay" && styles.methodRowActive]}
                      hitSlop={8}
                    >
                      <View style={styles.radio}>
                        {method === "razorpay" ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.methodInfo}>
                        <Text style={styles.methodTitle}>Razorpay</Text>
                        <Text style={styles.methodSub}>UPI · Cards · Netbanking · Wallets</Text>
                      </View>
                      <Ionicons name="card-outline" size={20} color={MUTED} />
                    </Pressable>

                    <Pressable
                      onPress={() => walletSufficient && setMethod("wallet")}
                      disabled={!walletSufficient}
                      style={[
                        styles.methodRow,
                        method === "wallet" && styles.methodRowActive,
                        !walletSufficient && styles.methodRowDisabled,
                      ]}
                      hitSlop={8}
                    >
                      <View style={[styles.radio, !walletSufficient && styles.radioDisabled]}>
                        {method === "wallet" ? <View style={styles.radioDot} /> : null}
                      </View>
                      <View style={styles.methodInfo}>
                        <Text
                          style={[styles.methodTitle, !walletSufficient && styles.methodTitleDisabled]}
                        >
                          Wallet
                        </Text>
                        <Text
                          style={[styles.methodSub, !walletSufficient && styles.methodSubDisabled]}
                        >
                          {walletSufficient
                            ? `${inr(walletBalance)} available · pays from earnings`
                            : `Insufficient — needs ${inr(amountRupees)}, has ${inr(walletBalance)}`}
                        </Text>
                      </View>
                      <Ionicons
                        name="wallet-outline"
                        size={20}
                        color={walletSufficient ? MUTED : "#CBD5E1"}
                      />
                    </Pressable>
                  </View>
                ) : null}

                {payError ? (
                  <View style={styles.inlineError}>
                    <Ionicons name="alert-circle-outline" size={16} color={DANGER} />
                    <Text style={styles.inlineErrorText}>{payError}</Text>
                  </View>
                ) : null}

                <View style={styles.actions}>
                  <Pressable
                    onPress={onClose}
                    disabled={paying}
                    style={[styles.cancelBtn, paying && styles.btnDisabled]}
                    hitSlop={8}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={handlePay}
                    disabled={paying}
                    style={[styles.payBtn, paying && styles.btnDisabled]}
                    hitSlop={8}
                  >
                    {paying ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.payText}>
                        {isSkipPayment ? "Activate" : `Pay ${inr(amountRupees)}`}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Razorpay hosted checkout — opens ONLY when Razorpay branch is chosen.
          The chooser modal above is hidden while this is open so the merchant
          doesn't see two overlays. */}
      <RazorpayCheckoutModal
        visible={razorpayVisible}
        orderParams={
          order && order.orderId && order.keyId && order.amount
            ? {
                orderId: order.orderId,
                keyId: order.keyId,
                amount: order.amount,
              }
            : null
        }
        prefill={prefill}
        themeColor={GREEN}
        onSuccess={handleRazorpaySuccess}
        onCancel={() => {
          setRazorpayVisible(false);
          setPayError("Payment cancelled.");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "700", color: TEXT },
  closeBtn: { padding: 4 },
  loadingBox: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 14, color: MUTED },
  errorBox: { paddingVertical: 32, alignItems: "center", gap: 12 },
  errorText: { fontSize: 14, color: DANGER, textAlign: "center", paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: GREEN,
  },
  retryText: { color: "#FFFFFF", fontWeight: "600" },
  summary: {
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  summaryLabel: { fontSize: 12, color: MUTED, fontWeight: "500" },
  summaryValue: { fontSize: 15, color: TEXT, fontWeight: "600", marginTop: 2 },
  summaryAmount: { fontSize: 24, color: TEXT, fontWeight: "700", marginTop: 2 },
  summarySub: { fontSize: 11.5, color: MUTED, marginTop: 4 },
  methodsBlock: { marginTop: 4, marginBottom: 8 },
  methodsLabel: { fontSize: 12, color: MUTED, fontWeight: "500", marginBottom: 8 },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  methodRowActive: {
    borderColor: GREEN,
    backgroundColor: "#F0FDF4",
  },
  methodRowDisabled: {
    opacity: 0.6,
    backgroundColor: "#F9FAFB",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDisabled: { borderColor: "#CBD5E1" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN_DARK },
  methodInfo: { flex: 1 },
  methodTitle: { fontSize: 14.5, fontWeight: "600", color: TEXT },
  methodTitleDisabled: { color: "#9CA3AF" },
  methodSub: { fontSize: 12, color: MUTED, marginTop: 2 },
  methodSubDisabled: { color: "#9CA3AF" },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    marginBottom: 8,
  },
  inlineErrorText: { fontSize: 12.5, color: DANGER, flex: 1 },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelText: { fontSize: 15, fontWeight: "600", color: MUTED },
  payBtn: {
    flex: 1.5,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: "center",
  },
  payText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.6 },
});
