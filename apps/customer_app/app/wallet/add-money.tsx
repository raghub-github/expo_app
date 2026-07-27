/**
 * GatiCash — Add money. Real Razorpay top-up; auto-add UI disabled for now.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { AppText } from "@/components/AppText";

import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
  type KeyboardEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { WalletSubpageHeader } from "@/components/wallet/WalletSubpageHeader";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "@/components/RazorpayCheckoutModal";
import { GatiMitraColors } from "@/constants/gatimitra";
import { walletService } from "@/services/wallet.service";

const PAGE_BG = "#F5F5F7";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const ACCENT = GatiMitraColors.primaryMint;
const ACCENT_SOFT = "#ECFDF5";

const PRESETS = [2000, 5000, 10000] as const;

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toLocaleString("en-IN");
}

function parseDigits(value: string, max = 50000): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return Math.min(Number(digits), max);
}

export default function WalletAddMoneyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState(2000);
  const [amountInputFocused, setAmountInputFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardFooterHeight, setKeyboardFooterHeight] = useState(0);
  const [paying, setPaying] = useState(false);
  const [pendingIntentId, setPendingIntentId] = useState<string | null>(null);
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

  const effectiveKeyboardHeight =
    keyboardHeight || (amountInputFocused && Platform.OS === "android" ? 300 : 0);

  useEffect(() => {
    if (!amountInputFocused) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [amountInputFocused]);

  const amountDisplay = useMemo(() => formatAmount(amount), [amount]);
  const canProceed = amount > 0 && !paying;

  const finalizeTopup = useCallback(
    async (result: RazorpayPaymentResult) => {
      if (!pendingIntentId) return;
      setPaying(true);
      try {
        const confirmed = await walletService.confirmTopup({
          intentId: pendingIntentId,
          razorpayOrderId: result.razorpayOrderId,
          razorpayPaymentId: result.razorpayPaymentId,
          razorpaySignature: result.razorpaySignature,
        });
        setRazorpayVisible(false);
        setRazorpayParams(null);
        setSimulatedPayment(null);
        setPendingIntentId(null);
        // Land on main wallet (behind the success sheet) and refresh ledger there.
        router.replace({
          pathname: "/wallet",
          params: {
            topupAmount: String(confirmed.amount),
            balanceAfter: String(confirmed.balance_after),
          },
        });
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not confirm top-up. If money was deducted, it will reflect shortly or contact support.";
        Alert.alert("Top-up failed", msg);
      } finally {
        setPaying(false);
      }
    },
    [pendingIntentId, router]
  );

  const onAddPaymentMethod = useCallback(async () => {
    if (!canProceed) return;
    Keyboard.dismiss();
    setPaying(true);
    try {
      const intent = await walletService.createTopupIntent(amount);
      setPendingIntentId(intent.intent_id);
      const isDummy =
        intent.key_id === "dummy_key" ||
        intent.key_id === "dev_sim_key" ||
        intent.razorpay_order_id.startsWith("dummy_");
      if (isDummy) {
        setSimulatedPayment({
          orderId: intent.razorpay_order_id,
          amount: intent.amount_paise,
        });
      } else {
        setRazorpayParams({
          orderId: intent.razorpay_order_id,
          keyId: intent.key_id,
          amount: intent.amount_paise,
        });
        setRazorpayVisible(true);
      }
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not start payment. Please try again.";
      Alert.alert("Payment unavailable", msg);
      setPendingIntentId(null);
    } finally {
      setPaying(false);
    }
  }, [amount, canProceed]);

  const renderPaymentCta = useCallback(
    (containerStyle?: ViewStyle) => (
      <View style={[styles.ctaStack, containerStyle]}>
        <TouchableOpacity
          style={[styles.ctaBtn, !canProceed && styles.ctaBtnDisabled]}
          activeOpacity={0.88}
          disabled={!canProceed}
          onPress={() => void onAddPaymentMethod()}
        >
          {paying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <AppText style={styles.ctaText}>
                Pay ₹{formatAmount(amount)}
              </AppText>
              <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
            </>
          )}
        </TouchableOpacity>
      </View>
    ),
    [amount, canProceed, onAddPaymentMethod, paying]
  );

  const keyboardScrollPadding =
    effectiveKeyboardHeight + keyboardFooterHeight + 16;

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor={PAGE_BG} />
      <View style={styles.screen}>
        <WalletSubpageHeader title="Add money" onBack={() => router.back()} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: amountInputFocused
                ? keyboardScrollPadding
                : insets.bottom + 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.amountCard}>
            <AppText style={styles.enterLabel}>Enter amount</AppText>
            <View style={styles.amountRow}>
              <AppText style={styles.rupee}>₹</AppText>
              <TextInput
                style={styles.amountInput}
                value={amountDisplay}
                onChangeText={(v) => setAmount(parseDigits(v))}
                keyboardType="number-pad"
                maxLength={8}
                editable={!paying}
                onFocus={() => setAmountInputFocused(true)}
                onBlur={() => {
                  setAmountInputFocused(false);
                  setKeyboardFooterHeight(0);
                }}
              />
            </View>

            <View style={styles.presetRow}>
              {PRESETS.map((preset) => {
                const active = amount === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    activeOpacity={0.85}
                    disabled={paying}
                    onPress={() => setAmount(preset)}
                  >
                    <AppText style={[styles.presetText, active && styles.presetTextActive]}>
                      ₹{formatAmount(preset)}
                    </AppText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Auto-add temporarily disabled — re-enable when auto top-up product is ready. */}

          {!amountInputFocused ? (
            <>
              <AppText style={styles.sectionLabel}>ADD WITH GIFT CARD</AppText>
              <View
                pointerEvents="none"
                style={styles.giftCardRowBlocked}
                accessibilityState={{ disabled: true }}
              >
                <Ionicons name="gift-outline" size={20} color={MUTED} />
                <AppText style={styles.giftCardLabel}>Claim a gift card</AppText>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </View>
              <AppText style={styles.comingSoonHint}>Coming soon</AppText>

              <AppText style={[styles.sectionLabel, { marginTop: 22 }]}>NOTE</AppText>
              <View style={styles.noteCard}>
                <AppText style={styles.noteBullet}>• Money added has an expiry of 10 years</AppText>
                <AppText style={styles.noteBullet}>
                  • Balance cannot be transferred to a bank account as per RBI guidelines
                </AppText>
                <AppText style={styles.noteBullet}>
                  • GatiCash can be used exclusively on GatiMitra.
                </AppText>
              </View>
            </>
          ) : null}
        </ScrollView>

        {amountInputFocused ? (
          <View
            style={[
              styles.keyboardStickyFooter,
              { bottom: effectiveKeyboardHeight, paddingBottom: insets.bottom > 0 ? 8 : 12 },
            ]}
            onLayout={(event) => {
              setKeyboardFooterHeight(event.nativeEvent.layout.height);
            }}
          >
            {renderPaymentCta()}
          </View>
        ) : (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            {renderPaymentCta()}
          </View>
        )}
      </View>

      <RazorpayCheckoutModal
        visible={razorpayVisible && razorpayParams != null}
        orderParams={razorpayParams}
        themeColor={ACCENT}
        onSuccess={(result) => void finalizeTopup(result)}
        onCancel={() => {
          setRazorpayVisible(false);
          setRazorpayParams(null);
          setPendingIntentId(null);
          // Match checkout: silent dismiss — user can tap Pay again.
        }}
      />

      {simulatedPayment != null ? (
        <View style={styles.simOverlay}>
          <View style={styles.simCard}>
            <AppText style={styles.simTitle}>Test payment</AppText>
            <AppText style={styles.simSub}>
              Dummy mode — simulate a successful GatiCash top-up of ₹
              {formatAmount(amount)}.
            </AppText>
            <TouchableOpacity
              style={styles.simSuccessBtn}
              activeOpacity={0.88}
              disabled={paying}
              onPress={() =>
                void finalizeTopup({
                  razorpayOrderId: simulatedPayment.orderId,
                  razorpayPaymentId: `dummy_pay_${Date.now()}`,
                  razorpaySignature: "simulated_signature",
                })
              }
            >
              {paying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <AppText style={styles.simSuccessText}>Simulate Success</AppText>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.simCancelBtn}
              activeOpacity={0.85}
              disabled={paying}
              onPress={() => {
                setSimulatedPayment(null);
                setPendingIntentId(null);
              }}
            >
              <AppText style={styles.simCancelText}>Cancel</AppText>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </>
  );
}

const CARD_SHADOW = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 6,
  elevation: 2,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  amountCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  enterLabel: { fontSize: 13, color: MUTED, fontWeight: "500", marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center" },
  rupee: { fontSize: 28, fontWeight: "800", color: TEXT, marginRight: 4 },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    color: TEXT,
    padding: 0,
    letterSpacing: -0.5,
  },
  presetRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  presetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  presetChipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_SOFT,
  },
  presetText: { fontSize: 14, fontWeight: "700", color: TEXT },
  presetTextActive: { color: "#15803D" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 10,
  },
  giftCardRowBlocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    opacity: 0.42,
    ...CARD_SHADOW,
  },
  giftCardLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: MUTED,
  },
  comingSoonHint: {
    fontSize: 11,
    color: MUTED,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: "500",
  },
  noteCard: { gap: 10 },
  noteBullet: { fontSize: 13, color: MUTED, lineHeight: 20 },
  ctaStack: { gap: 10 },
  keyboardStickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: PAGE_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: PAGE_BG,
    gap: 10,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
    minHeight: 52,
  },
  ctaBtnDisabled: {
    opacity: 0.45,
  },
  ctaText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  simOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    zIndex: 50,
  },
  simCard: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  simTitle: { fontSize: 18, fontWeight: "800", color: TEXT, textAlign: "center" },
  simSub: { fontSize: 14, color: MUTED, textAlign: "center", lineHeight: 20 },
  simSuccessBtn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  simSuccessText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  simCancelBtn: {
    paddingVertical: 10,
    alignItems: "center",
  },
  simCancelText: { fontSize: 14, fontWeight: "600", color: MUTED },
});
