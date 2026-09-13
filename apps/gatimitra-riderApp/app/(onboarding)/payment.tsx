// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
  Pressable,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router, useNavigation } from "expo-router";
import {
  openRazorpayCheckout,
  isNativeRazorpayAvailable,
  extractRazorpayError,
  isRazorpayUserCancel,
} from "@/src/lib/razorpay-native";
import { openHostedRazorpayCheckout } from "@/src/components/payment/RazorpayCheckoutModal";
import { PaymentFailedBottomSheet } from "@/src/components/payment/PaymentFailedBottomSheet";
import Constants from "expo-constants";
import { useQueryClient } from "@tanstack/react-query";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { colors } from "@/src/theme";
import {
  useCreatePaymentOrder,
  useVerifyPayment,
  useRecordPaymentAttempt,
} from "@/src/hooks/usePayment";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { useRiderOnboardingSummary } from "@/src/hooks/useRiderOnboardingSummary";
import { ServiceEligibilityNotice } from "@/src/components/onboarding/ServiceEligibilityNotice";
import { ONBOARDING_PAGE_BG } from "@/src/components/onboarding/OnboardingTopBar";
import { useOnboardingEstablishedRedirect } from "@/src/hooks/useOnboardingEstablishedRedirect";
import {
  onboardingStepToRoute,
  isVehicleOnboardingComplete,
  isOnboardingVehicleDocsComplete,
  resolveOnboardingMacroStepIndex,
  canAccessOnboardingPaymentScreen,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";
import { goBackOrReplace } from "@/src/lib/onboarding-navigation";
import { setOnboardingBackOverride } from "@/src/lib/onboarding-back-override";
import {
  formatRupeeFromPaise,
  useOnboardingFeeConfig,
} from "@/src/hooks/useOnboardingFeeConfig";
import {
  StepProgress,
  ErrorBanner,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";
import { fetchRiderHiringStatus } from "@/src/services/onboardingGeo.service";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const BG = ONBOARDING_PAGE_BG;

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
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const { data, hydrate } = useOnboardingStore();
  const createOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();
  const recordPaymentAttempt = useRecordPaymentAttempt();
  const feeConfigQuery = useOnboardingFeeConfig();
  const feeConfig = feeConfigQuery.data;
  // Backend-authoritative service impact for the payment gate (§7): which services will be
  // available after paying, and which stay blocked until documents are verified.
  const { summary: onboardingSummary } = useRiderOnboardingSummary();
  const { data: riderStatus, isFetched: riderStatusFetched } = useRiderStatus(data.riderId);
  useOnboardingEstablishedRedirect(riderStatus);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureSheet, setFailureSheet] = useState<{
    visible: boolean;
    message: string;
  }>({ visible: false, message: "" });
  const [footerHeight, setFooterHeight] = useState(120);
  const footerHeightRef = useRef(120);
  const mountedRef = useRef(true);
  const gateBounceRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const nextTitle = feeConfig?.headline?.trim() || "GMitra Prime";
    navigation.setOptions({ title: nextTitle });
  }, [navigation, feeConfig?.headline]);

  // Block payment when work location was never server-saved, or geo is NOT_HIRING.
  useEffect(() => {
    if (data.riderId && !riderStatusFetched) return;
    if (riderStatusFetched && riderStatus?.workLocationConfirmed !== true) {
      if (gateBounceRef.current === "/(onboarding)/location") return;
      gateBounceRef.current = "/(onboarding)/location";
      router.replace("/(onboarding)/location");
      return;
    }

    const token = session?.accessToken;
    if (!token || !data.riderId) return;

    let cancelled = false;
    void (async () => {
      try {
        const ha = riderStatus?.homeAddress;
        const source = data.locationSource || ha?.locationSource || null;
        const res = await fetchRiderHiringStatus(token, {
          riderId: String(data.riderId),
          stateId: data.stateId || ha?.stateId || null,
          regionId: data.regionId || ha?.regionId || null,
          districtId: data.districtId || ha?.districtId || null,
          state: data.state || ha?.state || null,
          region: data.region || ha?.region || null,
          district: data.district || ha?.district || null,
          manualOther: source === "manual_other",
        });
        if (cancelled) return;
        if (res.hiringAllowed === false) {
          if (gateBounceRef.current === "/(onboarding)/location") return;
          gateBounceRef.current = "/(onboarding)/location";
          router.replace("/(onboarding)/location");
        }
      } catch {
        // Keep payment if status already confirmed; location Continue enforces hiring on save.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    data.riderId,
    data.locationSource,
    data.stateId,
    data.regionId,
    data.districtId,
    data.state,
    data.region,
    data.district,
    riderStatusFetched,
    riderStatus?.workLocationConfirmed,
    riderStatus?.homeAddress,
    session?.accessToken,
  ]);

  useEffect(() => {
    if (data.riderId && !riderStatusFetched) return;

    const vehicleDone = isOnboardingVehicleDocsComplete(
      riderStatus?.completedOnboardingSteps,
      data.vehicleOnboardingFlow
    );
    let target: `/(onboarding)/${string}` | null = null;
    if (!data.vehicleChoice?.trim() && !vehicleDone) {
      target = "/(onboarding)/dl-rc";
    } else {
      const locallySubmitted =
        data.vehicleOnboardingSubmittedFor?.trim() === data.vehicleChoice?.trim();
      if (!locallySubmitted && !vehicleDone) {
        if (
          !canAccessOnboardingPaymentScreen({
            vehicleChoice: data.vehicleChoice,
            vehicleOnboardingSubmittedFor: data.vehicleOnboardingSubmittedFor,
            completedOnboardingSteps: riderStatus?.completedOnboardingSteps,
            vehicleOnboardingFlow: data.vehicleOnboardingFlow,
            skipBankAccountCheck: true,
          })
        ) {
          target = "/(onboarding)/dl-rc";
        }
      }
    }
    if (
      !target &&
      !data.bankAccountOnboardingDone &&
      !riderStatus?.bankAccountOnboardingDone
    ) {
      target = "/(onboarding)/bank-account";
    }
    if (!target) return;
    if (gateBounceRef.current === target) return;
    gateBounceRef.current = target;
    router.replace(target);
  }, [
    data.riderId,
    riderStatusFetched,
    data.vehicleChoice,
    data.vehicleOnboardingSubmittedFor,
    data.vehicleOnboardingFlow,
    data.bankAccountOnboardingDone,
    riderStatus?.completedOnboardingSteps,
    riderStatus?.bankAccountOnboardingDone,
  ]);

  useEffect(() => {
    if (data.riderId && !riderStatusFetched) return;
    const next = riderStatus?.nextOnboardingStep;
    if (!next || next === "payment" || next === "bank_account") return;

    // Vehicle package already finalized (including optional DL/RC skips) — never bounce
    // back to dl_rc/rental_ev from payment just because status briefly lags.
    const vehicleSubmitted =
      Boolean(data.vehicleChoice?.trim()) &&
      data.vehicleOnboardingSubmittedFor?.trim() === data.vehicleChoice.trim();
    if (
      (next === "dl_rc" || next === "rental_ev") &&
      (vehicleSubmitted ||
        isVehicleOnboardingComplete(
          next as ServerOnboardingStep,
          riderStatus?.completedOnboardingSteps,
          data.vehicleOnboardingFlow
        ))
    ) {
      return;
    }

    const href = onboardingStepToRoute(next as ServerOnboardingStep);
    if (gateBounceRef.current === href) return;
    gateBounceRef.current = href;
    router.replace(href);
  }, [
    data.riderId,
    riderStatusFetched,
    riderStatus?.nextOnboardingStep,
    riderStatus?.completedOnboardingSteps,
    data.vehicleOnboardingFlow,
    data.vehicleChoice,
    data.vehicleOnboardingSubmittedFor,
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
      Boolean(data.bankAccountOnboardingDone || riderStatus?.bankAccountOnboardingDone) &&
      (data.vehicleOnboardingSubmittedFor?.trim() === data.vehicleChoice?.trim() ||
        canAccessOnboardingPaymentScreen({
          vehicleChoice: data.vehicleChoice,
          vehicleOnboardingSubmittedFor: data.vehicleOnboardingSubmittedFor,
          completedOnboardingSteps: riderStatus?.completedOnboardingSteps,
          vehicleOnboardingFlow: data.vehicleOnboardingFlow,
          bankAccountOnboardingDone:
            data.bankAccountOnboardingDone || riderStatus?.bankAccountOnboardingDone,
        })),
    [
      data.vehicleChoice,
      data.vehicleOnboardingSubmittedFor,
      data.vehicleOnboardingFlow,
      data.bankAccountOnboardingDone,
      riderStatus?.completedOnboardingSteps,
      riderStatus?.bankAccountOnboardingDone,
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
  // Always show the live computed total — backend CTA copy can lag behind discounts.
  const payButtonLabel = `Pay ₹${totalDisplay} · Complete onboarding`;

  const isPaying = loading || createOrder.isPending;

  const showPaymentFailedSheet = useCallback((message: string) => {
    setLoading(false);
    setError(null);
    setFailureSheet({
      visible: true,
      message: message.trim() || "Payment was not completed. Please try again.",
    });
  }, []);

  const dismissFailureSheet = useCallback(() => {
    setFailureSheet({ visible: false, message: "" });
  }, []);

  const handlePaymentSuccess = useCallback((activated?: boolean) => {
    if (activated) {
      Alert.alert(
        "Payment Successful",
        "You're all set. Complete a few remaining details on the home screen to go online.",
        [{ text: "Continue", onPress: () => router.replace("/(tabs)/orders") }],
      );
      return;
    }
    Alert.alert(
      "Payment Successful",
      "Payment confirmed. Your account will activate once remaining verification is complete.",
      [{ text: "OK", onPress: () => router.replace("/(onboarding)/pending") }],
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
        // Refresh gate caches so tabs open without bouncing back to pending.
        try {
          await queryClient.invalidateQueries({ queryKey: ["rider", data.riderId] });
          await queryClient.invalidateQueries({ queryKey: ["rider", "eligibility"] });
        } catch {
          /* best-effort */
        }
        handlePaymentSuccess(result.activated === true);
      } else {
        showPaymentFailedSheet("Payment verification failed. Please try again.");
      }
    } catch (e) {
      showPaymentFailedSheet(
        e instanceof Error ? e.message : "Payment verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async (razorpayOrderId: string) => {
    if (!__DEV__) {
      showPaymentFailedSheet("Simulation only available in development");
      return;
    }
    await handleVerifyPayment(razorpayOrderId, `pay_${Date.now()}`, "simulated_signature");
  };

  // `react-native-razorpay` JS always loads, but the native bridge is absent in
  // Expo Go — calling open() throws "Cannot read property 'open' of null".
  const nativeCheckoutAvailable = isNativeRazorpayAvailable();
  const isExpoGo = Constants.appOwnership === "expo";

  const openNativeCheckout = useCallback(
    async (order: {
      orderId: string;
      amount: number;
      currency: string;
      key: string;
    }) => {
      try {
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
        const reason = isRazorpayUserCancel(rzpErr)
          ? "cancelled"
          : extractRazorpayError(rzpErr).description ||
            extractRazorpayError(rzpErr).code ||
            "failed";
        void recordPaymentAttempt
          .mutateAsync({
            riderId: data.riderId!,
            razorpayOrderId: order.orderId,
            status: "failed",
            reason,
          })
          .catch(() => undefined);
        showPaymentFailedSheet(
          isRazorpayUserCancel(rzpErr)
            ? "Payment was cancelled. You can try again."
            : extractRazorpayError(rzpErr).description ||
                "Payment failed. You can try again."
        );
      }
    },
    [
      data.fullName,
      data.riderId,
      session?.phoneE164,
      handleVerifyPayment,
      recordPaymentAttempt,
      showPaymentFailedSheet,
    ]
  );

  const openHostedCheckout = useCallback(
    async (order: { orderId: string; amount: number; key: string }) => {
      try {
        const hosted = await openHostedRazorpayCheckout({
          orderParams: {
            orderId: order.orderId,
            keyId: order.key,
            amount: order.amount,
          },
          prefill: { name: data.fullName?.trim(), contact: session?.phoneE164 },
          themeColor: ACCENT,
        });
        if (!hosted) {
          showPaymentFailedSheet("Payment was cancelled. You can try again.");
          return;
        }
        await handleVerifyPayment(
          hosted.razorpayOrderId,
          hosted.razorpayPaymentId,
          hosted.razorpaySignature
        );
      } catch {
        showPaymentFailedSheet("Payment failed. You can try again.");
      }
    },
    [data.fullName, session?.phoneE164, handleVerifyPayment, showPaymentFailedSheet]
  );

  const offerDevSimulate = useCallback(
    (order: { orderId: string; amount: number }, reason: string) => {
      Alert.alert(
        "Payment (dev)",
        `₹${formatRupeeFromPaise(order.amount)} onboarding fee.\n\n${reason}`,
        [
          { text: "Cancel", style: "cancel", onPress: () => setLoading(false) },
          {
            text: "Simulate Payment",
            onPress: () => void handleSimulatePayment(order.orderId),
          },
        ]
      );
    },
    []
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
    dismissFailureSheet();
    setLoading(true);

    try {
      const order = await createOrder.mutateAsync({ riderId: data.riderId });

      const keyId = order.key?.trim();
      const backendUnconfigured = !keyId || keyId.startsWith("dummy");

      if (!backendUnconfigured) {
        if (nativeCheckoutAvailable) {
          await openNativeCheckout({
            orderId: order.orderId,
            amount: order.amount,
            currency: order.currency,
            key: keyId!,
          });
          return;
        }

        // Expo Go: hosted checkout deep-links cause Unmatched / false logout.
        // Prefer simulate in __DEV__; production APK without native still uses hosted.
        if (isExpoGo || __DEV__) {
          offerDevSimulate(
            order,
            isExpoGo
              ? "Expo Go has no native Razorpay SDK. Simulate payment to continue onboarding, or use a dev-client / Play build for real checkout."
              : "Native Razorpay is not linked in this build. Simulate payment, or use a production APK."
          );
          return;
        }

        await openHostedCheckout({
          orderId: order.orderId,
          amount: order.amount,
          key: keyId!,
        });
        return;
      }

      if (__DEV__) {
        offerDevSimulate(
          order,
          "Backend has no live Razorpay key — set RAZORPAY_KEY_ID/SECRET to use real checkout."
        );
      } else {
        showPaymentFailedSheet("Payment is temporarily unavailable. Please try again shortly.");
      }
    } catch (e) {
      showPaymentFailedSheet(
        e instanceof Error ? e.message : "Failed to create payment order"
      );
    }
  };

  const handleBack = useCallback(() => {
    if (isPaying) return;
    goBackOrReplace("/(onboarding)/bank-account");
  }, [isPaying]);

  useEffect(() => {
    setOnboardingBackOverride(() => {
      if (isPaying) return true;
      handleBack();
      return true;
    });
    return () => setOnboardingBackOverride(null);
  }, [handleBack, isPaying]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  return (
    <View style={form.root}>
      <SafeAreaView style={form.safeArea} edges={["bottom"]}>
        <View style={styles.body}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(footerHeight + 24, 120) },
            ]}
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            scrollEnabled
            bounces
            nestedScrollEnabled
          >
            <View style={styles.introBlock}>
              <StepProgress steps={ONBOARDING_STEPS} currentIndex={macroStepIndex} />
              <Text style={styles.introSubtitle}>
                {feeConfig?.subtitle?.trim() ||
                  "Pay once to activate your rider account and start on services you’re eligible for."}
              </Text>
            </View>

            <View style={styles.pagePad}>
              {onboardingSummary ? (
                <ServiceEligibilityNotice
                  summary={onboardingSummary}
                  variant="requiredFor"
                />
              ) : (
                <View style={styles.eligibilityPlaceholder}>
                  <ActivityIndicator color={ACCENT_DARK} />
                  <Text style={styles.eligibilityPlaceholderText}>
                    Checking which services this fee unlocks…
                  </Text>
                </View>
              )}

              <LinearGradient
                colors={["#ECFDF5", "#FFFFFF"]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.amountCard}
              >
                <View style={styles.amountTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.amountEyebrow}>Amount due</Text>
                    <Text style={styles.amountValue}>₹{totalDisplay}</Text>
                    <Text style={styles.amountHint}>
                      {feeConfig?.feeLabel ?? "One-time onboarding fee"}
                      {standardDisplay !== feeConfig?.discountedOnboardingFee ? (
                        <Text style={styles.amountStruck}>  ₹{standardDisplay}</Text>
                      ) : null}
                    </Text>
                  </View>
                  {discountPct != null ? (
                    <View style={styles.discountBadge}>
                      <Ionicons name="pricetag" size={12} color="#B45309" />
                      <Text style={styles.discountBadgeText}>{discountPct}% off</Text>
                    </View>
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

                <View style={styles.coversRow}>
                  <View style={styles.coversIcon}>
                    <Ionicons name="shield-checkmark" size={16} color={ACCENT_DARK} />
                  </View>
                  <Text style={styles.coversText}>
                    {feeConfig?.infoMessage?.trim() ||
                      "Covers document verification and account setup"}
                  </Text>
                </View>

                {error ? <ErrorBanner message={error} /> : null}
              </LinearGradient>
            </View>
          </ScrollView>

          <View
            style={styles.footer}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (!mountedRef.current || !(h > 0)) return;
              if (Math.abs(h - footerHeightRef.current) <= 2) return;
              footerHeightRef.current = h;
              requestAnimationFrame(() => {
                if (mountedRef.current) setFooterHeight(h);
              });
            }}
          >
            <PayButton
              label={payButtonLabel}
              onPress={handleInitiatePayment}
              loading={isPaying}
              disabled={isPaying || !documentsReadyForPayment}
            />

            <Text style={styles.footerNote}>
              {feeConfig?.footerNote?.trim() ||
                "Non-refundable once verification begins. Locked services can be unlocked later from Profile."}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <PaymentFailedBottomSheet
        visible={failureSheet.visible}
        message={failureSheet.message}
        onCancel={dismissFailureSheet}
        onContinue={() => {
          dismissFailureSheet();
          void handleInitiatePayment();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 0,
    backgroundColor: BG,
  },
  introBlock: {
    paddingHorizontal: 20,
    paddingTop: 88,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: BG,
  },
  introSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
  },
  pagePad: {
    paddingHorizontal: 16,
    gap: 14,
    paddingBottom: 8,
    backgroundColor: BG,
  },
  eligibilityPlaceholder: {
    minHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#D1FAE5",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },
  eligibilityPlaceholderText: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  amountCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    padding: 18,
    gap: 14,
    overflow: "hidden",
    shadowColor: "#065F46",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  amountTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  amountEyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#059669",
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 40,
    fontWeight: "800",
    color: ACCENT_DARK,
    letterSpacing: -1.2,
  },
  amountHint: {
    marginTop: 2,
    fontSize: 13,
    color: colors.gray[500],
    fontWeight: "500",
  },
  amountStruck: {
    fontSize: 13,
    color: colors.gray[400],
    textDecorationLine: "line-through",
    fontWeight: "500",
  },
  discountBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  discountBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B45309",
  },
  breakdownBox: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
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
    backgroundColor: "#D1FAE5",
    marginVertical: 2,
  },
  coversRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  coversIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },
  coversText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 4 : 10,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(15, 23, 42, 0.06)",
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
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 52,
    width: "100%",
  },
  payBtnDisabled: {
    opacity: 0.65,
  },
  payBtnText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  footerNote: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.gray[500],
    textAlign: "center",
    marginTop: 8,
  },
});
