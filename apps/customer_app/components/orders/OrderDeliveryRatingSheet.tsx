import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  View,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { RazorpayCheckoutModal, type RazorpayPaymentResult } from "@/components/RazorpayCheckoutModal";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  RESTAURANT_RATING_TAGS,
  DELIVERY_RATING_TAGS,
  defaultTagsForRating,
} from "@/lib/post-delivery-rating-tags";
import { FOOD_TIP_PRESETS } from "@/components/orders/FoodOrderTipSheet";
import { paymentService } from "@/services/payment.service";
import { orderService } from "@/services/order.service";
import { useProfile } from "@/hooks/useProfile";

const GREEN = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
const TEXT = "#1C1C1C";
const MUTED = "#828282";

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.starRow}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${n} star${n > 1 ? "s" : ""}`}
          >
            <Ionicons
              name={filled ? "star" : "star-outline"}
              size={28}
              color={filled ? "#F59E0B" : "#D1D5DB"}
            />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function RatingTags({
  tags,
  selected,
  onToggle,
}: {
  tags: readonly string[];
  selected: string[];
  onToggle: (tag: string) => void;
}) {
  return (
    <View style={styles.tagsWrap}>
      {tags.map((tag) => {
        const active = selected.includes(tag);
        return (
          <TouchableOpacity
            key={tag}
            style={[styles.tagChip, active && styles.tagChipActive]}
            onPress={() => onToggle(tag)}
            activeOpacity={0.85}
          >
            <AppText style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</AppText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export type OrderDeliveryRatingSheetProps = {
  visible: boolean;
  orderId: string;
  storeName: string;
  storeBannerUri?: string | null;
  riderName?: string | null;
  /** Tip already paid at checkout or via tip sheet (₹). */
  existingTipAmount?: number;
  paymentMethodLabel?: string;
  submitting?: boolean;
  onClose: () => void;
  onTipPaid?: (amount: number) => void;
  onSubmit: (payload: {
    storeRating?: number;
    deliveryRating?: number;
    reviewText?: string;
    riderReviewText?: string;
    storeReviewTags?: string[];
    riderReviewTags?: string[];
  }) => void;
};

export function OrderDeliveryRatingSheet({
  visible,
  orderId,
  storeName,
  storeBannerUri,
  riderName,
  existingTipAmount = 0,
  paymentMethodLabel = "UPI",
  submitting = false,
  onClose,
  onTipPaid,
  onSubmit,
}: OrderDeliveryRatingSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const sheetHeight = Math.round(winH * 0.86);
  const { data: profile } = useProfile();

  const [storeRating, setStoreRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [storeSelectedTags, setStoreSelectedTags] = useState<string[]>([]);
  const [riderSelectedTags, setRiderSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [riderReviewText, setRiderReviewText] = useState("");

  const [selectedTip, setSelectedTip] = useState<number>(FOOD_TIP_PRESETS[0]);
  const [customTipMode, setCustomTipMode] = useState(false);
  const [customTipAmount, setCustomTipAmount] = useState("");
  const [tipPaying, setTipPaying] = useState(false);
  const [localTipPaid, setLocalTipPaid] = useState(0);
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

  const paidTip = Math.max(existingTipAmount, localTipPaid);
  const canOfferTip = paidTip <= 0;

  const tipAmount = useMemo(() => {
    if (customTipMode) {
      const n = Math.round(Number(customTipAmount));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return selectedTip;
  }, [customTipMode, customTipAmount, selectedTip]);

  useEffect(() => {
    if (!visible) return;
    setStoreRating(0);
    setDeliveryRating(0);
    setStoreSelectedTags([]);
    setRiderSelectedTags([]);
    setReviewText("");
    setRiderReviewText("");
    setSelectedTip(FOOD_TIP_PRESETS[0]);
    setCustomTipMode(false);
    setCustomTipAmount("");
    setLocalTipPaid(0);
    setRazorpayVisible(false);
    setRazorpayParams(null);
    setSimulatedPayment(null);
  }, [visible, orderId]);

  const handleStoreRatingChange = (stars: number) => {
    setStoreRating(stars);
    setStoreSelectedTags(defaultTagsForRating(RESTAURANT_RATING_TAGS, stars));
  };

  const handleDeliveryRatingChange = (stars: number) => {
    setDeliveryRating(stars);
    setRiderSelectedTags(defaultTagsForRating(DELIVERY_RATING_TAGS, stars));
  };

  const toggleStoreTag = (tag: string) => {
    setStoreSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleRiderTag = (tag: string) => {
    setRiderSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const partnerLabel = riderName?.trim() || "Your GatiMitra rider";

  const finalizeTip = useCallback(
    async (result: RazorpayPaymentResult) => {
      if (tipAmount <= 0) return;
      setTipPaying(true);
      try {
        await orderService.submitRiderTip(orderId, {
          tipAmount,
          razorpayOrderId: result.razorpayOrderId,
          razorpayPaymentId: result.razorpayPaymentId,
          razorpaySignature: result.razorpaySignature,
        });
        setRazorpayVisible(false);
        setRazorpayParams(null);
        setSimulatedPayment(null);
        setLocalTipPaid(tipAmount);
        onTipPaid?.(tipAmount);
        Alert.alert(
          "Thank you!",
          `₹${tipAmount} tip has been sent to ${partnerLabel.split(" ")[0] ?? "your delivery partner"}.`
        );
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not save your tip. Please try again.";
        Alert.alert("Tip failed", msg);
      } finally {
        setTipPaying(false);
      }
    },
    [tipAmount, orderId, onTipPaid, partnerLabel]
  );

  const handlePayTip = useCallback(async () => {
    if (tipAmount <= 0) {
      Alert.alert("Enter tip amount", "Choose ₹15, ₹20, ₹30 or enter a custom amount.");
      return;
    }
    if (paidTip > 0) {
      Alert.alert("Tip already added", "You have already tipped for this order.");
      return;
    }
    setTipPaying(true);
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
      setTipPaying(false);
    }
  }, [tipAmount, paidTip, orderId]);

  const hasStoreRating = storeRating >= 1;
  const hasDeliveryRating = deliveryRating >= 1;
  const canSubmit = (hasStoreRating || hasDeliveryRating) && !submitting && !tipPaying;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      ...(hasStoreRating ? { storeRating } : {}),
      ...(hasDeliveryRating ? { deliveryRating } : {}),
      reviewText: reviewText.trim() || undefined,
      riderReviewText: riderReviewText.trim() || undefined,
      ...(storeSelectedTags.length ? { storeReviewTags: storeSelectedTags } : {}),
      ...(riderSelectedTags.length ? { riderReviewTags: riderSelectedTags } : {}),
    });
  };

  return (
    <>
      <StoreBottomSheetShell
        visible={visible}
        onClose={onClose}
        maxHeightRatio={0.92}
        flushBottom
        keyboardAvoiding
        sheetStyle={{ height: sheetHeight }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={26} color={GREEN} />
            </View>
            <AppText style={styles.title}>Order delivered!</AppText>
            <AppText style={styles.subtitle}>
              Rate the restaurant, delivery partner, or both — at least one is enough.
            </AppText>
          </View>

          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>Restaurant</AppText>
            <View style={styles.entityRow}>
              {storeBannerUri ? (
                <Image source={{ uri: storeBannerUri }} style={styles.entityThumb} resizeMode="cover" />
              ) : (
                <View style={styles.entityThumbFallback}>
                  <Ionicons name="restaurant-outline" size={20} color={MUTED} />
                </View>
              )}
              <AppText style={styles.entityName} numberOfLines={2}>
                {storeName}
              </AppText>
            </View>
            <AppText style={styles.rateHint}>How was the food?</AppText>
            <StarRow value={storeRating} onChange={handleStoreRatingChange} />
            {storeRating >= 1 ? (
              <RatingTags
                tags={RESTAURANT_RATING_TAGS}
                selected={storeSelectedTags}
                onToggle={toggleStoreTag}
              />
            ) : null}
            <AppText style={styles.reviewLabel}>Review restaurant (optional)</AppText>
            <TextInput
              style={styles.reviewInput}
              placeholder="Food quality, packaging, taste…"
              placeholderTextColor={MUTED}
              value={reviewText}
              onChangeText={setReviewText}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.section}>
            <AppText style={styles.sectionTitle}>Delivery partner</AppText>
            <View style={styles.entityRow}>
              <View style={[styles.entityThumbFallback, styles.riderThumb]}>
                <Ionicons name="bicycle" size={22} color={GREEN} />
              </View>
              <AppText style={styles.entityName} numberOfLines={1}>
                {partnerLabel}
              </AppText>
            </View>
            <AppText style={styles.rateHint}>How was the delivery?</AppText>
            <StarRow value={deliveryRating} onChange={handleDeliveryRatingChange} />
            {deliveryRating >= 1 ? (
              <RatingTags
                tags={DELIVERY_RATING_TAGS}
                selected={riderSelectedTags}
                onToggle={toggleRiderTag}
              />
            ) : null}
            <AppText style={styles.reviewLabel}>Review delivery (optional)</AppText>
            <TextInput
              style={styles.reviewInput}
              placeholder="Delivery speed, rider behaviour, handling…"
              placeholderTextColor={MUTED}
              value={riderReviewText}
              onChangeText={setRiderReviewText}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />

            {canOfferTip ? (
              <View style={styles.tipBlock}>
                <AppText style={styles.tipTitle}>Tip your delivery partner</AppText>
                <AppText style={styles.tipSub}>
                  Paid securely via UPI / cards — 100% goes to the rider.
                </AppText>
                <View style={styles.tipRow}>
                  {FOOD_TIP_PRESETS.map((amount) => {
                    const active = !customTipMode && selectedTip === amount;
                    return (
                      <TouchableOpacity
                        key={amount}
                        style={[styles.tipChip, active && styles.tipChipActive]}
                        onPress={() => {
                          setCustomTipMode(false);
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
                    style={[styles.tipChip, customTipMode && styles.tipChipActive]}
                    onPress={() => setCustomTipMode(true)}
                    activeOpacity={0.85}
                  >
                    <AppText style={[styles.tipChipText, customTipMode && styles.tipChipTextActive]}>
                      Other
                    </AppText>
                  </TouchableOpacity>
                </View>
                {customTipMode ? (
                  <TextInput
                    style={styles.customTipInput}
                    keyboardType="number-pad"
                    placeholder="Enter amount"
                    placeholderTextColor="#9CA3AF"
                    value={customTipAmount}
                    onChangeText={setCustomTipAmount}
                    maxLength={4}
                  />
                ) : null}
                <View style={styles.payFooter}>
                  <View style={styles.payMethodCol}>
                    <AppText style={styles.payUsing}>PAY USING</AppText>
                    <AppText style={styles.payMethod}>
                      {paymentMethodLabel.replace(/_/g, " ")}
                    </AppText>
                  </View>
                  <TouchableOpacity
                    style={[styles.payBtn, (tipPaying || tipAmount <= 0) && styles.payBtnDisabled]}
                    onPress={() => void handlePayTip()}
                    disabled={tipPaying || tipAmount <= 0}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={[MINT_DARK, GREEN]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.payBtnGradient}
                    >
                      {tipPaying ? (
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
              </View>
            ) : (
              <View style={styles.tipPaidBanner}>
                <Ionicons name="heart" size={16} color={GREEN} />
                <AppText style={styles.tipPaidText}>You tipped ₹{Math.round(paidTip)}</AppText>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            disabled={!canSubmit}
            onPress={handleSubmit}
            activeOpacity={0.9}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppText style={styles.submitBtnText}>Submit rating</AppText>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.laterBtn}
            onPress={onClose}
            disabled={submitting || tipPaying}
            activeOpacity={0.8}
          >
            <AppText style={styles.laterBtnText}>Maybe later</AppText>
          </TouchableOpacity>
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
        themeColor={GREEN}
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
          <AppText style={styles.simSub}>
            ₹{tipAmount} to {partnerLabel}
          </AppText>
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  header: { alignItems: "center", marginBottom: 14 },
  successIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontWeight: "700", color: TEXT, textAlign: "center" },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    textAlign: "center",
    paddingHorizontal: 4,
  },
  section: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAF9",
    borderWidth: 1,
    borderColor: "#E8F5EE",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: GREEN,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  entityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  entityThumb: { width: 44, height: 44, borderRadius: 8 },
  entityThumbFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  riderThumb: { backgroundColor: "#ECFDF5" },
  entityName: { flex: 1, fontSize: 15, fontWeight: "600", color: TEXT },
  rateHint: { fontSize: 13, fontWeight: "600", color: TEXT, marginBottom: 6 },
  starRow: { flexDirection: "row", gap: 4, marginBottom: 8 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  tagChipActive: {
    borderColor: GatiMitraColors.warmOrange,
    backgroundColor: "#FFF7ED",
  },
  tagChipText: { fontSize: 12, fontWeight: "600", color: TEXT },
  tagChipTextActive: { color: GatiMitraColors.warmOrange },
  reviewLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginBottom: 6, marginTop: 2 },
  reviewInput: {
    minHeight: 64,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: "#EBEBEB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  tipBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8F5EE",
  },
  tipTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  tipSub: { fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 10, lineHeight: 16 },
  tipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  tipChip: {
    minWidth: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  tipChipActive: {
    borderColor: GREEN,
    backgroundColor: "#ECFDF5",
  },
  tipChipText: { fontSize: 14, fontWeight: "700", color: TEXT },
  tipChipTextActive: { color: GREEN },
  customTipInput: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  payFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  payMethodCol: { flexShrink: 0 },
  payUsing: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.4 },
  payMethod: { fontSize: 13, fontWeight: "700", color: TEXT, marginTop: 2, textTransform: "uppercase" },
  payBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  payBtnDisabled: { opacity: 0.5 },
  payBtnGradient: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  payBtnTotal: { color: "#fff", fontSize: 12, fontWeight: "600", opacity: 0.95 },
  payBtnCta: { color: "#fff", fontSize: 15, fontWeight: "800" },
  tipPaidBanner: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#ECFDF5",
  },
  tipPaidText: { fontSize: 13, fontWeight: "700", color: GREEN },
  submitBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  laterBtn: { marginTop: 10, paddingVertical: 10, alignItems: "center" },
  laterBtnText: { fontSize: 14, fontWeight: "600", color: MUTED },
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
    elevation: 8,
  },
  simTitle: { fontSize: 17, fontWeight: "700", color: TEXT, textAlign: "center" },
  simSub: { fontSize: 13, color: MUTED, textAlign: "center", marginTop: 6, marginBottom: 16 },
  simSuccessBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  simSuccessText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  simCancelBtn: { marginTop: 10, paddingVertical: 10, alignItems: "center" },
  simCancelText: { color: MUTED, fontWeight: "600", fontSize: 14 },
});
