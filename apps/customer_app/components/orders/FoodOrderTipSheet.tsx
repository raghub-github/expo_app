/**
 * GatiMitra-style delivery partner tip sheet — live order tracking.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ScrollView, Image, TextInput, ActivityIndicator, Alert, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "@/components/RazorpayCheckoutModal";
import { GatiMitraColors } from "@/constants/gatimitra";
import { STORAGE_KEYS } from "@/constants";
import { paymentService } from "@/services/payment.service";
import { orderService } from "@/services/order.service";
import { useProfile } from "@/hooks/useProfile";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

export const FOOD_TIP_PRESETS = [15, 20, 30] as const;

type FoodOrderTipSheetProps = {
  visible: boolean;
  orderId: string;
  partnerName: string;
  partnerPhotoUri?: string | null;
  paymentMethodLabel?: string;
  existingTipAmount?: number;
  onClose: () => void;
  onTipPaid: (amount: number) => void;
};

export function FoodOrderTipSheet({
  visible,
  orderId,
  partnerName,
  partnerPhotoUri,
  paymentMethodLabel = "UPI",
  existingTipAmount = 0,
  onClose,
  onTipPaid,
}: FoodOrderTipSheetProps) {
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();

  const [selectedTip, setSelectedTip] = useState<number>(FOOD_TIP_PRESETS[0]);
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [saveForNext, setSaveForNext] = useState(true);
  const [paying, setPaying] = useState(false);
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

  const tipAmount = useMemo(() => {
    if (customMode) {
      const n = Math.round(Number(customAmount));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return selectedTip;
  }, [customMode, customAmount, selectedTip]);

  useEffect(() => {
    if (!visible) return;
    void AsyncStorage.getItem(STORAGE_KEYS.SAVED_DELIVERY_TIP).then((raw) => {
      const saved = raw != null ? Math.round(Number(raw)) : FOOD_TIP_PRESETS[0];
      if (FOOD_TIP_PRESETS.includes(saved as (typeof FOOD_TIP_PRESETS)[number])) {
        setSelectedTip(saved as (typeof FOOD_TIP_PRESETS)[number]);
        setCustomMode(false);
      } else if (saved > 0) {
        setCustomMode(true);
        setCustomAmount(String(saved));
      }
    });
    setSaveForNext(true);
  }, [visible]);

  const finalizeTip = useCallback(
    async (result: RazorpayPaymentResult) => {
      if (tipAmount <= 0) return;
      setPaying(true);
      try {
        await orderService.submitRiderTip(orderId, {
          tipAmount,
          razorpayOrderId: result.razorpayOrderId,
          razorpayPaymentId: result.razorpayPaymentId,
          razorpaySignature: result.razorpaySignature,
        });
        if (saveForNext) {
          await AsyncStorage.setItem(STORAGE_KEYS.SAVED_DELIVERY_TIP, String(tipAmount));
        }
        setRazorpayVisible(false);
        setRazorpayParams(null);
        setSimulatedPayment(null);
        onClose();
        onTipPaid(tipAmount);
        Alert.alert(
          "Thank you!",
          `₹${tipAmount} tip has been sent to ${partnerName.split(" ")[0] ?? "your delivery partner"}.`
        );
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not save your tip. Please try again.";
        Alert.alert("Tip failed", msg);
      } finally {
        setPaying(false);
      }
    },
    [tipAmount, orderId, saveForNext, onClose, onTipPaid, partnerName]
  );

  const handlePayTip = useCallback(async () => {
    if (tipAmount <= 0) {
      Alert.alert("Enter tip amount", "Choose ₹15, ₹20, ₹30 or enter a custom amount.");
      return;
    }
    if (existingTipAmount > 0) {
      Alert.alert("Tip already added", "You have already tipped for this order.");
      return;
    }
    setPaying(true);
    try {
      const razorpayOrder = await paymentService.createRazorpayOrder({
        amountPaise: tipAmount * 100,
        receipt: `tip_${orderId}_${Date.now()}`,
      });
      const isDummy =
        razorpayOrder.keyId === "dummy_key" || razorpayOrder.keyId === "dev_sim_key";
      if (isDummy) {
        setSimulatedPayment({ orderId: razorpayOrder.orderId, amount: razorpayOrder.amount });
      } else {
        setRazorpayParams({
          orderId: razorpayOrder.orderId,
          keyId: razorpayOrder.keyId,
          amount: razorpayOrder.amount,
        });
        setRazorpayVisible(true);
      }
    } catch {
      Alert.alert("Payment unavailable", "Could not start tip payment. Please try again.");
    } finally {
      setPaying(false);
    }
  }, [tipAmount, existingTipAmount, orderId]);

  const handleClear = () => {
    setCustomMode(false);
    setCustomAmount("");
    setSelectedTip(FOOD_TIP_PRESETS[0]);
  };

  if (existingTipAmount > 0) return null;

  return (
    <>
      <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.78}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <View style={styles.avatarWrap}>
            {partnerPhotoUri ? (
              <Image source={{ uri: partnerPhotoUri }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <AppText style={styles.avatarInitial}>{partnerName.slice(0, 1).toUpperCase()}</AppText>
              </View>
            )}
          </View>

          <AppText style={styles.title}>Tip your delivery partner</AppText>
          <AppText style={styles.subtitle}>
            Delivery partner will get notified instantly. The full tip is sent after delivery.
          </AppText>

          <View style={styles.tipRow}>
            {FOOD_TIP_PRESETS.map((amount) => {
              const active = !customMode && selectedTip === amount;
              return (
                <TouchableOpacity
                  key={amount}
                  style={[styles.tipChip, active && styles.tipChipActive]}
                  onPress={() => {
                    setCustomMode(false);
                    setSelectedTip(amount);
                  }}
                  activeOpacity={0.85}
                >
                  <AppText style={[styles.tipChipText, active && styles.tipChipTextActive]}>
                    ₹{amount}
                  </AppText>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.tipChip, customMode && styles.tipChipActive]}
              onPress={() => setCustomMode(true)}
              activeOpacity={0.85}
            >
              <AppText style={[styles.tipChipText, customMode && styles.tipChipTextActive]}>Other</AppText>
            </TouchableOpacity>
          </View>

          {customMode ? (
            <View style={styles.customWrap}>
              <AppText style={styles.customLabel}>Custom amount</AppText>
              <TextInput
                style={styles.customInput}
                keyboardType="number-pad"
                placeholder="Enter amount"
                placeholderTextColor="#9CA3AF"
                value={customAmount}
                onChangeText={setCustomAmount}
                maxLength={4}
              />
            </View>
          ) : null}

          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.saveRow}
              onPress={() => setSaveForNext((v) => !v)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={saveForNext ? "checkbox" : "square-outline"}
                size={20}
                color={saveForNext ? MINT : MUTED}
              />
              <AppText style={styles.saveText}>Save tip for next order</AppText>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClear} hitSlop={8}>
              <AppText style={styles.clearText}>Clear</AppText>
            </TouchableOpacity>
          </View>

          <View style={styles.payFooter}>
            <View style={styles.payMethodCol}>
              <AppText style={styles.payUsing}>PAY USING</AppText>
              <AppText style={styles.payMethod}>{paymentMethodLabel.replace(/_/g, " ")}</AppText>
            </View>
            <TouchableOpacity
              style={[styles.payBtn, (paying || tipAmount <= 0) && styles.payBtnDisabled]}
              onPress={() => void handlePayTip()}
              disabled={paying || tipAmount <= 0}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={[MINT_DARK, MINT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.payBtnGradient}
              >
                {paying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <AppText style={styles.payBtnTotal}>₹{tipAmount} TOTAL</AppText>
                    <AppText style={styles.payBtnCta}>Pay tip ›</AppText>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </StoreBottomSheetShell>

      <RazorpayCheckoutModal
        visible={razorpayVisible}
        orderParams={razorpayParams}
        prefill={{
          contact: profile?.mobile_number ?? undefined,
          email: profile?.email ?? undefined,
          name: profile?.full_name ?? undefined,
        }}
        themeColor={MINT}
        onSuccess={(result) => void finalizeTip(result)}
        onCancel={() => {
          setRazorpayVisible(false);
          setRazorpayParams(null);
        }}
      />

      <Modal visible={simulatedPayment != null} transparent animationType="fade">
        <Pressable style={styles.simBackdrop} onPress={() => setSimulatedPayment(null)} />
        <View style={styles.simCard}>
          <AppText style={styles.simTitle}>Simulate tip payment</AppText>
          <AppText style={styles.simSub}>₹{tipAmount} to {partnerName}</AppText>
          <TouchableOpacity
            style={styles.simSuccessBtn}
            onPress={() => {
              if (!simulatedPayment) return;
              void finalizeTip({
                razorpayOrderId: simulatedPayment.orderId,
                razorpayPaymentId: `sim_tip_${Date.now()}`,
                razorpaySignature: "simulated_signature",
              });
            }}
          >
            <AppText style={styles.simSuccessText}>Simulate Success</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.simCancelBtn} onPress={() => setSimulatedPayment(null)}>
            <AppText style={styles.simCancelText}>Cancel</AppText>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: "center", marginTop: 4, marginBottom: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: "#fff" },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  avatarInitial: { fontSize: 28, fontWeight: "800", color: GatiMitraColors.emerald },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 24,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  tipChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  tipChipActive: {
    borderColor: GatiMitraColors.warmOrange,
    backgroundColor: "#FFF7ED",
  },
  tipChipText: { fontSize: 15, fontWeight: "700", color: TEXT },
  tipChipTextActive: { color: GatiMitraColors.warmOrange },
  customWrap: { paddingHorizontal: 16, marginBottom: 12 },
  customLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginBottom: 6 },
  customInput: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  optionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  saveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveText: { fontSize: 13, color: TEXT, fontWeight: "500" },
  clearText: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.errorRed },
  payFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
  },
  payMethodCol: { flex: 1 },
  payUsing: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.4 },
  payMethod: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    textTransform: "capitalize",
    marginTop: 2,
  },
  payBtn: { borderRadius: 14, overflow: "hidden", minWidth: 168 },
  payBtnDisabled: { opacity: 0.55 },
  payBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  payBtnTotal: { fontSize: 14, fontWeight: "800", color: "#fff" },
  payBtnCta: { fontSize: 14, fontWeight: "700", color: "#fff" },
  simBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  simCard: {
    position: "absolute",
    left: 24,
    right: 24,
    top: "35%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },
  simTitle: { fontSize: 18, fontWeight: "800", color: TEXT, marginBottom: 6 },
  simSub: { fontSize: 14, color: MUTED, marginBottom: 16 },
  simSuccessBtn: {
    backgroundColor: MINT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  simSuccessText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  simCancelBtn: { alignItems: "center", paddingVertical: 10 },
  simCancelText: { color: MUTED, fontWeight: "600" },
});
