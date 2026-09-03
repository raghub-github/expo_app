// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  openRazorpayCheckout,
  isNativeRazorpayAvailable,
} from "@/src/lib/razorpay-native";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { colors } from "@/src/theme";
import {
  useCreatePaymentOrder,
  useVerifyPayment,
  useRecordPaymentAttempt,
} from "@/src/hooks/usePayment";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import {
  onboardingStepToRoute,
  isVehicleOnboardingComplete,
  resolveOnboardingMacroStepIndex,
  canAccessOnboardingPaymentScreen,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";
import {
  formatRupeeFromPaise,
  useOnboardingFeeConfig,
} from "@/src/hooks/useOnboardingFeeConfig";
import {
  StepProgress,
  ErrorBanner,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";

const ONBOARDING_STEPS = ["KYC", "Vehicle", "Payment"];

function PayButton({
  label,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const inactive = Boolean(loading || disabled);

  return (
    <TouchableOpacity
      activeOpacity={inactive ? 1 : 0.88}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.payBtn, inactive && styles.payBtnDisabled]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <>
          <Ionicons name="wallet-outline" size={20} color="#ffffff" />
          <Text style={styles.payBtnText}>{label}</Text>
          <Ionicons name="arrow-forward" size={18} color="#ffffff" />
        </>
      )}
    </TouchableOpacity>
  );
}

function PriceRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.priceRowLabel, bold && styles.priceRowLabelBold]}>{label}</Text>
      <Text
        style={[
          styles.priceRowValue,
          bold && styles.priceRowValueBold,
          accent && styles.priceRowValueAccent,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

export default function PaymentScreen() {
  const session = useSessionStore((s) => s.session);
  const { data, hydrate } = useOnboardingStore();
  const createOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();
  const recordPaymentAttempt = useRecordPaymentAttempt();
  const feeConfigQuery = useOnboardingFeeConfig();
  const feeConfig = feeConfigQuery.data;
  const { data: riderStatus } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!data.vehicleChoice?.trim()) {
      router.replace("/(onboarding)/dl-rc");
      return;
    }
    const locallySubmitted =
      data.vehicleOnboardingSubmittedFor?.trim() === data.vehicleChoice.trim();
    if (!locallySubmitted) {
      if (
        !canAccessOnboardingPaymentScreen({
          vehicleChoice: data.vehicleChoice,
          vehicleOnboardingSubmittedFor: data.vehicleOnboardingSubmittedFor,
          completedOnboardingSteps: riderStatus?.completedOnboardingSteps,
          vehicleOnboardingFlow: data.vehicleOnboardingFlow,
          skipBankAccountCheck: true,
        })
      ) {
        router.replace("/(onboarding)/dl-rc");
        return;
      }
    }
    if (!data.bankAccountOnboardingDone) {
      router.replace("/(onboarding)/bank-account");
    }
  }, [
    data.vehicleChoice,
    data.vehicleOnboardingSubmittedFor,
    data.vehicleOnboardingFlow,
    data.bankAccountOnboardingDone,
    riderStatus?.completedOnboardingSteps,
  ]);

  useEffect(() => {
    const next = riderStatus?.nextOnboardingStep;
    if (!next || next === "payment" || next === "bank_account") return;
    if (
      next === "rental_ev" &&
      isVehicleOnboardingComplete(
        next as ServerOnboardingStep,
        riderStatus?.completedOnboardingSteps,
        data.vehicleOnboardingFlow
      )
    ) {
      return;
    }
    router.replace(onboardingStepToRoute(next as ServerOnboardingStep));
  }, [
    riderStatus?.nextOnboardingStep,
    riderStatus?.completedOnboardingSteps,
    data.vehicleOnboardingFlow,
  ]);

  const macroStepIndex = useMemo(() => {
    if (typeof riderStatus?.macroStepIndex === "number") {
      return Math.min(3, Math.max(0, riderStatus.macroStepIndex));
    }
    return resolveOnboardingMacroStepIndex(
      riderStatus?.completedOnboardingSteps,
      data.vehicleOnboardingFlow
    );
  }, [
    riderStatus?.macroStepIndex,
    riderStatus?.completedOnboardingSteps,
    data.vehicleOnboardingFlow,
  ]);

  const documentsReadyForPayment = useMemo(
    () =>
      Boolean(data.bankAccountOnboardingDone) &&
      (data.vehicleOnboardingSubmittedFor?.trim() === data.vehicleChoice?.trim() ||
        canAccessOnboardingPaymentScreen({
          vehicleChoice: data.vehicleChoice,
          vehicleOnboardingSubmittedFor: data.vehicleOnboardingSubmittedFor,
          completedOnboardingSteps: riderStatus?.completedOnboardingSteps,
          vehicleOnboardingFlow: data.vehicleOnboardingFlow,
          bankAccountOnboardingDone: data.bankAccountOnboardingDone,
        })),
    [
      data.vehicleChoice,
      data.vehicleOnboardingSubmittedFor,
      data.vehicleOnboardingFlow,
      data.bankAccountOnboardingDone,
      riderStatus?.completedOnboardingSteps,
    ]
  );

  const totalDisplay = useMemo(
    () => formatRupeeFromPaise(feeConfig?.totalPaise ?? 5782),
    [feeConfig?.totalPaise]
  );
  const subtotalDisplay = useMemo(
    () => formatRupeeFromPaise(feeConfig?.subtotalPaise ?? 4900),
    [feeConfig?.subtotalPaise]
  );
  const gstDisplay = useMemo(
    () => formatRupeeFromPaise(feeConfig?.gstAmountPaise ?? 0),
    [feeConfig?.gstAmountPaise]
  );
  const gstPct = useMemo(() => {
    const n = parseFloat(feeConfig?.gstPercent ?? "0");
    return Number.isFinite(n) ? n : 0;
  }, [feeConfig?.gstPercent]);
  const discountPct = useMemo(() => {
    const n = parseFloat(feeConfig?.discountPercent ?? "0");
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }, [feeConfig?.discountPercent]);
  const standardDisplay = feeConfig?.standardOnboardingFee ?? "99";
  const payButtonLabel =
    feeConfig?.payButtonText?.trim() || `Pay ₹${totalDisplay}`;

  const isPaying = loading || createOrder.isPending;

  const handlePaymentSuccess = useCallback(() => {
    Alert.alert(
      "Payment Successful",
      "Your onboarding fee has been paid. Waiting for admin approval.",
      [{ text: "OK", onPress: () => router.replace("/(onboarding)/pending") }]
    );
  }, []);

  const handleVerifyPayment = async (
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      if (!data.riderId) throw new Error("Rider ID not found");

      const result = await verifyPayment.mutateAsync({
        riderId: data.riderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      if (result.success) {
        handlePaymentSuccess();
      } else {
        setError("Payment verification failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async (razorpayOrderId: string) => {
    if (!__DEV__) {
      setError("Simulation only available in development");
      return;
    }
    await handleVerifyPayment(razorpayOrderId, `pay_${Date.now()}`, "simulated_signature");
  };

  // `react-native-razorpay` is a native module — present in dev-client / EAS
  // builds, absent in Expo Go. Guard so the screen degrades to the dev
  // simulator instead of crashing when the native module isn't linked.
  const nativeCheckoutAvailable = isNativeRazorpayAvailable();

  const openNativeCheckout = useCallback(
    async (order: {
      orderId: string;
      amount: number;
      currency: string;
      key: string;
    }) => {
      try {
        // Resolves on success with the three verification tokens; rejects with
        // { code, description } on user cancel or gateway failure.
        const result = await openRazorpayCheckout({
          order: {
            orderId: order.orderId,
            amount: order.amount,
            currency: order.currency,
            keyId: order.key,
          },
          prefill: { name: data.fullName?.trim(), contact: session?.phoneE164 },
          name: "GatiMitra",
          description: "Rider onboarding fee",
          themeColor: ACCENT,
        });
        await handleVerifyPayment(
          result.razorpayOrderId,
          result.razorpayPaymentId,
          result.razorpaySignature
        );
      } catch (rzpErr: unknown) {
        const desc =
          rzpErr && typeof rzpErr === "object" && "description" in rzpErr
            ? String((rzpErr as { description?: unknown }).description ?? "")
            : "";
        const code =
          rzpErr && typeof rzpErr === "object" && "code" in rzpErr
            ? String((rzpErr as { code?: unknown }).code ?? "")
            : "";
        // Record the abandoned/failed attempt so the lifecycle is auditable
        // server-side (best-effort — never block the UI on it).
        void recordPaymentAttempt.mutateAsync({
          riderId: data.riderId!,
          razorpayOrderId: order.orderId,
          status: "failed",
          reason: desc || code || "cancelled",
        }).catch(() => undefined);
        setError(desc || "Payment was cancelled. You can try again.");
        setLoading(false);
      }
    },
    [data.fullName, data.riderId, session?.phoneE164, handleVerifyPayment, recordPaymentAttempt]
  );

  const handleInitiatePayment = async () => {
    if (!documentsReadyForPayment) {
      setError("Please complete KYC and vehicle steps before payment.");
      return;
    }
    if (!data.riderId) {
      setError("Rider ID not found");
      return;
    }
    if (!session?.accessToken) {
      setError("Not authenticated. Please login again.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const order = await createOrder.mutateAsync({ riderId: data.riderId });
      setOrderId(order.orderId);

      const keyId = order.key?.trim();
      const backendUnconfigured = !keyId || keyId.startsWith("dummy");

      // Real native checkout when the backend returned a live key AND the
      // native module is linked. Otherwise fall back: dev → simulator, prod →
      // surfaced error (should not happen once Razorpay keys are set on VPS).
      if (!backendUnconfigured && nativeCheckoutAvailable) {
        await openNativeCheckout({
          orderId: order.orderId,
          amount: order.amount,
          currency: order.currency,
          key: keyId!,
        });
        return;
      }

      if (__DEV__) {
        Alert.alert(
          "Payment (dev)",
          `₹${formatRupeeFromPaise(order.amount)} onboarding fee.\nOrder: ${order.orderId}\n\n${
            nativeCheckoutAvailable
              ? "Backend has no live Razorpay key — set RAZORPAY_KEY_ID/SECRET to use real checkout."
              : "Native Razorpay module not linked (Expo Go). Use a dev-client build for real checkout."
          }`,
          [
            { text: "Cancel", style: "cancel", onPress: () => setLoading(false) },
            { text: "Simulate Payment", onPress: () => handleSimulatePayment(order.orderId) },
          ]
        );
      } else {
        setError("Payment is temporarily unavailable. Please try again shortly.");
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment order");
      setLoading(false);
    }
  };

  return (
    <View style={form.root}>
      <SafeAreaView style={form.safeArea} edges={["top", "bottom"]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={form.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={["#dff5e4", BG]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[form.header, styles.headerExtra]}
          >
            <StepProgress steps={ONBOARDING_STEPS} currentIndex={macroStepIndex} />

            <View style={[form.stepPill, styles.stepPillSpaced]}>
              <Ionicons name="card-outline" size={14} color={ACCENT_DARK} />
              <Text style={form.stepPillText}>Step 5 · Payment</Text>
            </View>

            <Text style={form.title}>{feeConfig?.headline ?? "Onboarding Fee"}</Text>
            <Text style={form.subtitle}>
              {feeConfig?.subtitle ?? "Complete your onboarding by paying the registration fee"}
            </Text>
          </LinearGradient>

          <View style={[form.formCard, styles.paymentCard]}>
            <View style={styles.heroBlock}>
              {discountPct != null ? (
                <View style={styles.discountBadge}>
                  <Ionicons name="pricetag" size={12} color="#b45309" />
                  <Text style={styles.discountBadgeText}>{discountPct}% off</Text>
                </View>
              ) : null}

              <Text style={styles.heroAmount}>₹{totalDisplay}</Text>
              <Text style={styles.heroLabel}>{feeConfig?.feeLabel ?? "One-time onboarding fee"}</Text>

              {standardDisplay !== feeConfig?.discountedOnboardingFee ? (
                <Text style={styles.heroStruck}>₹{standardDisplay}</Text>
              ) : null}
            </View>

            <View style={styles.breakdownBox}>
              <PriceRow label="Onboarding fee" value={`₹${subtotalDisplay}`} />
              {gstPct > 0 ? (
                <PriceRow label={`GST (${gstPct}%)`} value={`₹${gstDisplay}`} />
              ) : null}
              <View style={styles.breakdownDivider} />
              <PriceRow label="Total payable" value={`₹${totalDisplay}`} bold accent />
            </View>

            <View style={styles.infoBanner}>
              <Ionicons name="information-circle-outline" size={20} color="#0369A1" />
              <Text style={styles.infoBannerText}>
                {feeConfig?.infoMessage ?? "This fee covers document verification and account setup"}
              </Text>
            </View>

            {feeConfig?.alertNotice ? (
              <View style={styles.alertBox}>
                <Ionicons name="shield-checkmark-outline" size={18} color={ACCENT_DARK} />
                <Text style={styles.alertText}>{feeConfig.alertNotice}</Text>
              </View>
            ) : null}

            {error ? <ErrorBanner message={error} /> : null}

            {orderId ? (
              <View style={styles.orderBox}>
                <Text style={styles.orderText}>Order ID: {orderId}</Text>
                <Text style={styles.orderHint}>Dev mode — Razorpay checkout opens in production</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PayButton
            label={payButtonLabel}
            onPress={handleInitiatePayment}
            loading={isPaying}
            disabled={isPaying || !documentsReadyForPayment}
          />

          {feeConfig?.footerNote ? (
            <Text style={styles.footerNote}>{feeConfig.footerNote}</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  headerExtra: {
    paddingBottom: 24,
  },
  stepPillSpaced: {
    marginTop: 8,
  },
  paymentCard: {
    gap: 16,
    marginBottom: 8,
  },
  heroBlock: {
    alignItems: "center",
    paddingVertical: 8,
    gap: 4,
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  discountBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#b45309",
  },
  heroAmount: {
    fontSize: 48,
    fontWeight: "800",
    color: ACCENT_DARK,
    letterSpacing: -1,
  },
  heroLabel: {
    fontSize: 14,
    color: colors.gray[500],
    fontWeight: "500",
  },
  heroStruck: {
    fontSize: 15,
    color: colors.gray[400],
    textDecorationLine: "line-through",
    marginTop: 2,
  },
  breakdownBox: {
    backgroundColor: colors.gray[50],
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceRowLabel: {
    fontSize: 14,
    color: colors.gray[600],
  },
  priceRowLabelBold: {
    fontWeight: "700",
    color: colors.gray[900],
  },
  priceRowValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.gray[800],
  },
  priceRowValueBold: {
    fontSize: 16,
    fontWeight: "800",
  },
  priceRowValueAccent: {
    color: ACCENT_DARK,
  },
  breakdownDivider: {
    height: 1,
    backgroundColor: colors.gray[200],
    marginVertical: 2,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#E0F2FE",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: "#0369A1",
  },
  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#edf8f0",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.2)",
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.gray[700],
  },
  orderBox: {
    padding: 12,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 10,
  },
  orderText: {
    fontSize: 12,
    color: "#166534",
    marginBottom: 4,
  },
  orderHint: {
    fontSize: 11,
    color: "#166534",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === "ios" ? 4 : 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(57, 211, 83, 0.15)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    minHeight: 54,
    width: "100%",
  },
  payBtnDisabled: {
    opacity: 0.65,
  },
  payBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
  },
  footerNote: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.gray[500],
    textAlign: "center",
    marginTop: 10,
  },
});
