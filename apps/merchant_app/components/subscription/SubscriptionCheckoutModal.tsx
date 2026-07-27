/**
 * Subscription checkout — curved bottom sheet (permission/OTP-style wave header).
 * Already-on-plan → congratulations (not error/Retry).
 */
import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  createSubscriptionPaymentOrder,
  payMerchantSubscriptionWithWallet,
  verifySubscriptionPayment,
  type CreateSubscriptionOrderResponse,
} from "@/services/subscriptionPaymentApi";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "./RazorpayCheckoutModal";
import {
  PaymentFailedSheet,
  resolvePaymentSourceLabel,
} from "./PaymentFailedSheet";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  visible: boolean;
  storeId: number;
  planId: number;
  planName: string;
  token: string;
  prefill?: { contact?: string | null; email?: string | null; name?: string | null };
  onSuccess: (result: {
    subscriptionId?: number;
    via: "wallet" | "razorpay" | "skipped";
    alreadyOnPlan?: boolean;
  }) => void;
  onClose: () => void;
};

type Method = "razorpay" | "wallet";

const GREEN = GatiMitraMerchant.primary;
const GREEN_DARK = GatiMitraMerchant.primaryDark;
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const DANGER = "#DC2626";
const TEXT = "#0F172A";
const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";

function inr(rupees: number | undefined | null): string {
  const n = Number(rupees ?? 0);
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function isAlreadyOnPlanError(message: string | null | undefined): boolean {
  const m = String(message || "").toLowerCase();
  return m.includes("already on this plan") || m.includes("already on plan");
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
  const [failedSheet, setFailedSheet] = useState<{
    amountRupees: number;
    paymentSourceLabel: string;
  } | null>(null);

  const amountRupees = Number(order?.amountToCharge ?? 0);
  const walletBalance = Number(order?.walletAvailableBalance ?? 0);
  const walletSufficient = walletBalance + 0.001 >= amountRupees;
  const isSkipPayment = order?.skipPayment === true;

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setOrder(null);
    setPayError(null);
    try {
      const res = await createSubscriptionPaymentOrder(storeId, token, planId);
      setOrder(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load plan";
      if (isAlreadyOnPlanError(msg)) {
        // Hand off to the shared congratulations sheet (no error / Retry).
        onSuccess({ via: "skipped", alreadyOnPlan: true });
        return;
      }
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [storeId, token, planId, onSuccess]);

  useEffect(() => {
    if (!visible) {
      setOrder(null);
      setLoadError(null);
      setPayError(null);
      setPaying(false);
      setRazorpayVisible(false);
      setMethod("razorpay");
      setFailedSheet(null);
      return;
    }
    void loadOrder();
  }, [visible, loadOrder]);

  const openFailedSheet = useCallback(
    (args: { method: "wallet" | "razorpay"; error?: unknown; amount?: number }) => {
      setFailedSheet({
        amountRupees: args.amount ?? amountRupees,
        paymentSourceLabel: resolvePaymentSourceLabel({
          method: args.method,
          error: args.error,
        }),
      });
    },
    [amountRupees]
  );

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
        const msg =
          e instanceof Error ? e.message : "Payment verification failed. Please contact support.";
        if (isAlreadyOnPlanError(msg)) {
          onSuccess({ via: "razorpay", alreadyOnPlan: true });
        } else {
          openFailedSheet({ method: "razorpay", error: e });
        }
      } finally {
        setPaying(false);
      }
    },
    [storeId, token, planId, onSuccess, openFailedSheet]
  );

  const handlePay = useCallback(async () => {
    if (paying || !order) return;
    setPayError(null);

    if (isSkipPayment) {
      setPaying(true);
      try {
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
          } else if (isAlreadyOnPlanError(res.error)) {
            onSuccess({ via: "wallet", alreadyOnPlan: true });
          } else {
            openFailedSheet({
              method: "wallet",
              error: new Error(res.error ?? "Wallet payment failed"),
              amount: amountRupees,
            });
          }
          return;
        }
        onSuccess({ subscriptionId: res.subscriptionId, via: "wallet" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Wallet payment failed";
        if (isAlreadyOnPlanError(msg)) {
          onSuccess({ via: "wallet", alreadyOnPlan: true });
        } else {
          openFailedSheet({ method: "wallet", error: e });
        }
      } finally {
        setPaying(false);
      }
      return;
    }

    if (!order.orderId || !order.keyId || !order.amount) {
      setPayError("Payment gateway is not configured. Please try again later.");
      return;
    }
    setRazorpayVisible(true);
  }, [
    paying,
    order,
    isSkipPayment,
    method,
    walletSufficient,
    walletBalance,
    amountRupees,
    storeId,
    token,
    planId,
    onSuccess,
    openFailedSheet,
  ]);

  return (
    <>
      <PermissionBottomSheetShell
        visible={visible && !razorpayVisible && !failedSheet}
        dismissible={!paying}
        onDismiss={onClose}
        maxHeightRatio={0.88}
      >
        <View style={styles.sheetInner}>
          <View style={styles.header}>
            <Text style={styles.title}>Confirm subscription</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} disabled={paying}>
              <Ionicons name="close" size={20} color={MUTED} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={GREEN} />
              <Text style={styles.loadingText}>Loading plan…</Text>
            </View>
          ) : loadError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={28} color={DANGER} />
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
      </PermissionBottomSheetShell>

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
        }}
        onFailure={({ rawError }) => {
          setRazorpayVisible(false);
          openFailedSheet({ method: "razorpay", error: rawError });
        }}
      />

      <PaymentFailedSheet
        visible={!!failedSheet}
        amountRupees={failedSheet?.amountRupees ?? amountRupees}
        paymentSourceLabel={failedSheet?.paymentSourceLabel ?? "Razorpay"}
        onClose={() => setFailedSheet(null)}
        onRetry={() => {
          setFailedSheet(null);
          setPayError(null);
          if (method === "wallet") {
            void handlePay();
          } else {
            setRazorpayVisible(true);
          }
        }}
        onTryAnotherMethod={() => {
          setFailedSheet(null);
          setPayError(null);
          setMethod(method === "wallet" ? "razorpay" : "wallet");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sheetInner: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontFamily: LORA_BOLD, color: TEXT },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingBox: { paddingVertical: 40, alignItems: "center", gap: 10 },
  loadingText: { fontSize: 14, fontFamily: LORA, color: MUTED },
  errorBox: { paddingVertical: 28, alignItems: "center", gap: 12 },
  errorText: {
    fontSize: 14,
    fontFamily: LORA,
    color: DANGER,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: GREEN,
  },
  retryText: { color: "#FFFFFF", fontFamily: LORA_BOLD },
  summary: {
    backgroundColor: "#F0FDFA",
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    marginBottom: 12,
  },
  summaryLabel: { fontSize: 12, color: MUTED, fontFamily: LORA_BOLD },
  summaryValue: { fontSize: 16, color: TEXT, fontFamily: LORA_BOLD, marginTop: 2 },
  summaryAmount: { fontSize: 26, color: TEXT, fontFamily: POPPINS_BOLD, marginTop: 2 },
  summarySub: { fontSize: 12, color: MUTED, fontFamily: LORA, marginTop: 4 },
  methodsBlock: { marginTop: 4, marginBottom: 8 },
  methodsLabel: { fontSize: 12, color: MUTED, fontFamily: LORA_BOLD, marginBottom: 8 },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
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
    backgroundColor: "#F8FAFC",
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
  methodTitle: { fontSize: 15, fontFamily: LORA_BOLD, color: TEXT },
  methodTitleDisabled: { color: "#9CA3AF" },
  methodSub: { fontSize: 12, fontFamily: LORA, color: MUTED, marginTop: 2 },
  methodSubDisabled: { color: "#9CA3AF" },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    marginBottom: 8,
  },
  inlineErrorText: { fontSize: 13, fontFamily: LORA, color: DANGER, flex: 1 },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  cancelText: { fontSize: 15, fontFamily: LORA_BOLD, color: MUTED },
  payBtn: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: "center",
  },
  payText: { fontSize: 15, fontFamily: LORA_BOLD, color: "#FFFFFF" },
  btnDisabled: { opacity: 0.6 },
});
