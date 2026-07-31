/**
 * Zepto-style blocking sheet when rider tries to go ON-DUTY while
 * subscription penalty / dues block dispatch.
 * Layout matches "Subscription Payment Required" product design.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import {
  useRiderSubscriptionPayDues,
  useRiderSubscriptionStatus,
} from "@/src/hooks/useRiderSubscription";
import { useRiderSubscriptionDuesPayment } from "@/src/hooks/useRiderSubscriptionDuesPayment";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import {
  openRazorpayCheckout,
  isNativeRazorpayAvailable,
  extractRazorpayError,
  isRazorpayUserCancel,
} from "@/src/lib/razorpay-native";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const TEAL = colors.primary[500];
const TEAL_DARK = colors.primary[700];

function formatRupee(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function SubscriptionHeroArt() {
  return (
    <View style={styles.heroWrap} accessibilityElementsHidden>
      <View style={styles.heroDoc}>
        <Text style={styles.heroDocLabel}>SUBSCRIPTION</Text>
        <View style={styles.heroDocLines}>
          <View style={styles.heroDocLine} />
          <View style={[styles.heroDocLine, { width: "70%" }]} />
          <View style={[styles.heroDocLine, { width: "55%" }]} />
        </View>
      </View>
      <View style={styles.heroWallet}>
        <Ionicons name="wallet" size={36} color={TEAL} />
      </View>
      <View style={styles.heroShield}>
        <Ionicons name="shield-checkmark" size={22} color={TEAL_DARK} />
      </View>
      <View style={styles.heroMax}>
        <Ionicons name="star" size={12} color="#F59E0B" />
        <Text style={styles.heroMaxText}>MAX</Text>
      </View>
      <View style={styles.heroCoin}>
        <Text style={styles.heroCoinText}>₹</Text>
      </View>
      <View style={styles.heroWarn}>
        <Ionicons name="alert" size={14} color="#FFFFFF" />
      </View>
    </View>
  );
}

export function SubscriptionDutyBlockedSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { data: status, refetch } = useRiderSubscriptionStatus();
  const { data: riderProfile } = useRiderProfile();
  const payDues = useRiderSubscriptionPayDues();
  const duesPayment = useRiderSubscriptionDuesPayment();
  const [paying, setPaying] = useState(false);

  const banner = status?.dues?.alertBanner;
  const totalDue = banner?.totalDue ?? status?.dues?.totalDue ?? 0;
  const canPayFromWallet = banner?.canPayFromWallet === true;
  const planName =
    status?.plan?.planName?.trim() ||
    t("subscription.defaultPlanName", "GatiMitra MAX");

  const handleVerifyPayment = useCallback(
    async (razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string) => {
      setPaying(true);
      try {
        await duesPayment.verifyPayment.mutateAsync({
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        });
        await refetch();
        onClose();
        Alert.alert(
          t("subscription.duesPaidTitle", "Payment successful"),
          t("subscription.duesPaidMessage", "Subscription dues cleared. You can go on duty now.")
        );
      } catch (e) {
        Alert.alert(
          t("common.error", "Error"),
          extractApiErrorMessage(e, t("subscription.payFailed", "Payment failed"))
        );
      } finally {
        setPaying(false);
      }
    },
    [duesPayment.verifyPayment, onClose, refetch, t]
  );

  const handlePay = useCallback(async () => {
    if (paying || totalDue <= 0) return;
    setPaying(true);
    try {
      if (canPayFromWallet) {
        const result = await payDues.mutateAsync();
        await refetch();
        if (result.totalDueAfter <= 0) {
          onClose();
          Alert.alert(
            t("subscription.duesPaidTitle", "Payment successful"),
            t(
              "subscription.duesPaidFromWallet",
              "{{amount}} cleared from wallet. You can go on duty now.",
              { amount: formatRupee(result.paidAmount) }
            )
          );
          return;
        }
      }

      const order = await duesPayment.createOrder.mutateAsync();
      if (!order.success || !order.orderId || !order.keyId) {
        throw new Error(t("subscription.payFailed", "Payment failed"));
      }

      if (order.dummyMode || order.keyId === "dummy_key") {
        Alert.alert(
          t("subscription.payTitle", "Pay subscription dues"),
          t(
            "subscription.payDummyMessage",
            "Dummy payment mode — simulate Razorpay success for {{amount}}?",
            { amount: formatRupee(order.amountRupees ?? totalDue) }
          ),
          [
            { text: t("common.cancel", "Cancel"), style: "cancel", onPress: () => setPaying(false) },
            {
              text: t("home.simulatePayment", "Simulate payment"),
              onPress: () => {
                void handleVerifyPayment(order.orderId, `pay_${Date.now()}`, "simulated_signature");
              },
            },
          ]
        );
        return;
      }

      if (!isNativeRazorpayAvailable()) {
        Alert.alert(
          t("common.error", "Error"),
          t(
            "subscription.nativeMissing",
            "Native Razorpay is not available in this build. Please install the latest Play Store / APK build (not Expo Go)."
          )
        );
        setPaying(false);
        return;
      }

      try {
        const result = await openRazorpayCheckout({
          order: {
            orderId: order.orderId,
            amount: order.amount,
            keyId: order.keyId,
          },
          prefill: { name: riderProfile?.name, contact: riderProfile?.mobile },
          name: "GatiMitra",
          description: "Subscription dues",
          themeColor: "#D4A017",
        });
        await handleVerifyPayment(
          result.razorpayOrderId,
          result.razorpayPaymentId,
          result.razorpaySignature
        );
      } catch (rzpErr) {
        if (!isRazorpayUserCancel(rzpErr)) {
          const { description, code } = extractRazorpayError(rzpErr);
          Alert.alert(
            t("common.error", "Error"),
            description || code || t("subscription.payFailed", "Payment failed")
          );
        }
        setPaying(false);
      }
    } catch (e) {
      Alert.alert(
        t("common.error", "Error"),
        extractApiErrorMessage(e, t("subscription.payFailed", "Payment failed"))
      );
    } finally {
      setPaying(false);
    }
  }, [
    canPayFromWallet,
    duesPayment.createOrder,
    handleVerifyPayment,
    onClose,
    payDues,
    paying,
    refetch,
    riderProfile?.name,
    riderProfile?.mobile,
    t,
    totalDue,
  ]);

  const payLabel =
    banner?.payButtonLabel?.trim() ||
    (totalDue > 0
      ? t("subscription.payDuesCta", "Pay {{amount}}", { amount: formatRupee(totalDue) })
      : t("subscription.getHelp", "GET HELP"));

  return (
    <>
      <BlockingBottomSheetShell visible={visible} maxHeightRatio={0.88}>
        <View style={styles.body}>
          <SubscriptionHeroArt />

          <Text style={styles.title}>
            {t("subscription.paymentRequiredTitle", "Subscription Payment Required")}
          </Text>

          <Text style={styles.message}>
            {t(
              "subscription.paymentRequiredBodyPrefix",
              "Your"
            )}{" "}
            <Text style={styles.planName}>{planName}</Text>{" "}
            {t(
              "subscription.paymentRequiredBody",
              "subscription fee couldn't be deducted because your wallet balance was insufficient. Complete the pending payment to continue receiving ride requests and go online."
            )}
          </Text>

          {totalDue > 0 ? (
            <View style={styles.dueCard}>
              <Text style={styles.dueLabel}>
                {t("subscription.pendingFeeLabel", "Pending Subscription Fee")}
              </Text>
              <Text style={styles.dueAmount}>{formatRupee(totalDue)}</Text>
            </View>
          ) : null}

          <View style={styles.benefitsRow}>
            <View style={styles.benefitItem}>
              <View style={styles.benefitIcon}>
                <Ionicons name="shield-checkmark" size={18} color={TEAL_DARK} />
              </View>
              <Text style={styles.benefitText}>
                {t("subscription.benefitOnline", "Go online instantly")}
              </Text>
            </View>
            <View style={styles.benefitDivider} />
            <View style={styles.benefitItem}>
              <View style={styles.benefitIcon}>
                <Ionicons name="bicycle" size={18} color={TEAL_DARK} />
              </View>
              <Text style={styles.benefitText}>
                {t("subscription.benefitRides", "Continue receiving ride requests")}
              </Text>
            </View>
            <View style={styles.benefitDivider} />
            <View style={styles.benefitItem}>
              <View style={styles.benefitIcon}>
                <Ionicons name="ribbon" size={18} color={TEAL_DARK} />
              </View>
              <Text style={styles.benefitText}>
                {t("subscription.benefitMax", "MAX benefits remain active")}
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.primaryBtn, paying && { opacity: 0.7 }]}
            onPress={() => void handlePay()}
            disabled={paying || totalDue <= 0}
          >
            {paying ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{payLabel}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => {
              onClose();
              router.push("/your-subscription");
            }}
            disabled={paying}
          >
            <Text style={styles.secondaryBtnText}>
              {t("subscription.viewSubscriptionDetails", "View Subscription Details")}
            </Text>
          </Pressable>

          <Pressable style={styles.closeBtn} onPress={onClose} disabled={paying}>
            <Text style={styles.closeBtnText}>{t("subscription.notNow", "Not Now")}</Text>
          </Pressable>
        </View>
      </BlockingBottomSheetShell>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingBottom: 8,
    alignItems: "center",
  },
  heroWrap: {
    width: 168,
    height: 120,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroDoc: {
    position: "absolute",
    left: 8,
    top: 10,
    width: 78,
    height: 92,
    borderRadius: 10,
    backgroundColor: "#E0F2F1",
    borderWidth: 1,
    borderColor: "#99F6E4",
    padding: 8,
    transform: [{ rotate: "-8deg" }],
  },
  heroDocLabel: {
    fontSize: 7,
    fontWeight: "800",
    color: TEAL_DARK,
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  heroDocLines: {
    gap: 5,
  },
  heroDocLine: {
    height: 4,
    width: "100%",
    borderRadius: 2,
    backgroundColor: "#99F6E4",
  },
  heroWallet: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: "#F0FDFA",
    borderWidth: 2,
    borderColor: "#99F6E4",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  heroShield: {
    position: "absolute",
    right: 18,
    top: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ECFDF5",
    borderWidth: 1.5,
    borderColor: "#6EE7B7",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  heroMax: {
    position: "absolute",
    right: 10,
    top: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    zIndex: 3,
  },
  heroMaxText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#B45309",
  },
  heroCoin: {
    position: "absolute",
    left: 28,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FEF3C7",
    borderWidth: 1.5,
    borderColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  heroCoinText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#B45309",
  },
  heroWarn: {
    position: "absolute",
    right: 36,
    bottom: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  planName: {
    fontWeight: "800",
    color: "#111827",
  },
  dueCard: {
    width: "100%",
    backgroundColor: "#FFF1F2",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  dueLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9F1239",
  },
  dueAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#BE123C",
  },
  benefitsRow: {
    width: "100%",
    backgroundColor: "#ECFDF5",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 18,
  },
  benefitItem: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 6,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    color: "#065F46",
    textAlign: "center",
  },
  benefitDivider: {
    width: 1,
    backgroundColor: "#A7F3D0",
    marginVertical: 4,
  },
  primaryBtn: {
    width: "100%",
    backgroundColor: TEAL,
    borderRadius: 14,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  secondaryBtn: {
    width: "100%",
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: TEAL,
    marginBottom: 4,
  },
  secondaryBtnText: {
    color: TEAL_DARK,
    fontSize: 14,
    fontWeight: "700",
  },
  closeBtn: {
    paddingVertical: 12,
  },
  closeBtnText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "600",
  },
});
