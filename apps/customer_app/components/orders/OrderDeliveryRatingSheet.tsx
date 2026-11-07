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
  Platform,
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
import { useWalletBalance, WALLET_BALANCE_QUERY_KEY } from "@/hooks/useWalletBalance";
import { useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/constants";

const GREEN = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const BORDER = "#E8EEEA";
const CARD_BG = "#F7FAF8";

type TipPayMethod = "upi" | "gaticash";

/** Pay-method chips for tip (also keeps Fast Refresh from crashing on a stale TIP_PAY_METHODS ref). */
const TIP_PAY_METHODS: ReadonlyArray<{ id: TipPayMethod; label: string }> = [
  { id: "upi", label: "UPI" },
  { id: "gaticash", label: "GatiCash" },
];

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
              size={30}
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
  /** @deprecated Tip pay method is chosen in-sheet; order method is not used as default. */
  paymentMethodLabel?: string;
  /** Self-pickup / takeaway — no rider to rate or tip. */
  hideDeliveryPartner?: boolean;
  /** Parcel — rate delivery partner only (no restaurant). */
  hideStoreRating?: boolean;
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
  }) => void | Promise<void>;
};

export function OrderDeliveryRatingSheet({
  visible,
  orderId,
  storeName,
  storeBannerUri,
  riderName,
  existingTipAmount = 0,
  hideDeliveryPartner = false,
  hideStoreRating = false,
  submitting = false,
  onClose,
  onTipPaid,
  onSubmit,
}: OrderDeliveryRatingSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const sheetHeight = Math.round(winH * (hideStoreRating ? 0.78 : 0.86));
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const { data: wallet } = useWalletBalance();
  const walletAvailable = Math.max(
    0,
    Number(wallet?.available_balance ?? wallet?.balance ?? 0)
  );

  const [storeRating, setStoreRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [storeSelectedTags, setStoreSelectedTags] = useState<string[]>([]);
  const [riderSelectedTags, setRiderSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [riderReviewText, setRiderReviewText] = useState("");

  const [selectedTip, setSelectedTip] = useState<number>(FOOD_TIP_PRESETS[0]);
  const [customTipMode, setCustomTipMode] = useState(false);
  const [customTipAmount, setCustomTipAmount] = useState("");
  const [saveTipForNext, setSaveTipForNext] = useState(true);
  const [tipPayMethod, setTipPayMethod] = useState<TipPayMethod>("upi");
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
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [thankYouSheet, setThankYouSheet] = useState<{
    title: string;
    message: string;
    ctaLabel: string;
  } | null>(null);

  const paidTip = Math.max(existingTipAmount, localTipPaid);
  const canOfferTip = !hideDeliveryPartner && paidTip <= 0;

  const tipAmount = useMemo(() => {
    if (customTipMode) {
      const n = Math.round(Number(customTipAmount));
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return selectedTip;
  }, [customTipMode, customTipAmount, selectedTip]);

  const canPayWithGatiCash = tipAmount > 0 && walletAvailable + 0.005 >= tipAmount;

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
    setSaveTipForNext(true);
    setTipPayMethod("upi");
    setLocalTipPaid(0);
    setRatingSubmitted(false);
    setThankYouSheet(null);
    setRazorpayVisible(false);
    setRazorpayParams(null);
    setSimulatedPayment(null);
    void AsyncStorage.getItem(STORAGE_KEYS.SAVED_DELIVERY_TIP).then((raw) => {
      const saved = raw != null ? Math.round(Number(raw)) : FOOD_TIP_PRESETS[0];
      if (FOOD_TIP_PRESETS.includes(saved as (typeof FOOD_TIP_PRESETS)[number])) {
        setSelectedTip(saved as (typeof FOOD_TIP_PRESETS)[number]);
        setCustomTipMode(false);
      } else if (saved > 0) {
        setCustomTipMode(true);
        setCustomTipAmount(String(saved));
      }
    });
  }, [visible, orderId]);

  useEffect(() => {
    if (tipPayMethod === "gaticash" && !canPayWithGatiCash) {
      setTipPayMethod("upi");
    }
  }, [tipPayMethod, canPayWithGatiCash]);

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

  const afterTipSuccess = useCallback(
    async (amount: number) => {
      if (saveTipForNext) {
        await AsyncStorage.setItem(STORAGE_KEYS.SAVED_DELIVERY_TIP, String(amount));
      }
      setRazorpayVisible(false);
      setRazorpayParams(null);
      setSimulatedPayment(null);
      setLocalTipPaid(amount);
      onTipPaid?.(amount);
      setThankYouSheet({
        title: "Tip sent!",
        message: `₹${amount} tip has been sent to ${partnerLabel.split(" ")[0] ?? "your delivery partner"}.`,
        ctaLabel: "Done",
      });
    },
    [saveTipForNext, onTipPaid, partnerLabel]
  );

  const finalizeTip = useCallback(
    async (result: RazorpayPaymentResult) => {
      if (tipAmount <= 0) return;
      setTipPaying(true);
      try {
        await orderService.submitRiderTip(orderId, {
          tipAmount,
          paymentMethod: "upi",
          razorpayOrderId: result.razorpayOrderId,
          razorpayPaymentId: result.razorpayPaymentId,
          razorpaySignature: result.razorpaySignature,
        });
        await afterTipSuccess(tipAmount);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not save your tip. Please try again.";
        Alert.alert("Tip failed", msg);
      } finally {
        setTipPaying(false);
      }
    },
    [tipAmount, orderId, afterTipSuccess]
  );

  const selectTipPayMethod = (method: TipPayMethod) => {
    if (method === "gaticash" && !canPayWithGatiCash) {
      Alert.alert(
        "Insufficient GatiCash",
        tipAmount > 0
          ? `You need ₹${tipAmount} in GatiCash (available ₹${Math.floor(walletAvailable)}).`
          : "Add a tip amount first, then switch to GatiCash if balance is enough."
      );
      return;
    }
    setTipPayMethod(method);
  };

  const handleClearTip = () => {
    setCustomTipMode(false);
    setCustomTipAmount("");
    setSelectedTip(FOOD_TIP_PRESETS[0]);
  };

  const handlePayTip = useCallback(async () => {
    if (tipAmount <= 0) {
      Alert.alert("Enter tip amount", "Choose ₹15, ₹20, ₹30 or enter a custom amount.");
      return;
    }
    if (paidTip > 0) {
      Alert.alert("Tip already added", "You have already tipped for this order.");
      return;
    }

    if (tipPayMethod === "gaticash") {
      if (!canPayWithGatiCash) {
        Alert.alert(
          "Insufficient GatiCash",
          "Your wallet balance is not enough for this tip. Pay with UPI instead."
        );
        setTipPayMethod("upi");
        return;
      }
      setTipPaying(true);
      try {
        await orderService.submitRiderTip(orderId, {
          tipAmount,
          paymentMethod: "gaticash",
        });
        void queryClient.invalidateQueries({ queryKey: WALLET_BALANCE_QUERY_KEY });
        await afterTipSuccess(tipAmount);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          "Could not pay tip with GatiCash. Try UPI instead.";
        Alert.alert("Tip failed", msg);
        setTipPayMethod("upi");
      } finally {
        setTipPaying(false);
      }
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
  }, [
    tipAmount,
    paidTip,
    tipPayMethod,
    canPayWithGatiCash,
    orderId,
    afterTipSuccess,
    queryClient,
  ]);

  const hasStoreRating = !hideStoreRating && storeRating >= 1;
  const hasDeliveryRating = !hideDeliveryPartner && deliveryRating >= 1;
  const canSubmit =
    !ratingSubmitted &&
    (hideDeliveryPartner
      ? hasStoreRating && !submitting
      : hideStoreRating
        ? hasDeliveryRating && !submitting && !tipPaying
        : (hasStoreRating || hasDeliveryRating) && !submitting && !tipPaying);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await Promise.resolve(
        onSubmit({
          ...(hasStoreRating ? { storeRating } : {}),
          ...(hasDeliveryRating ? { deliveryRating } : {}),
          reviewText: hideStoreRating ? undefined : reviewText.trim() || undefined,
          riderReviewText: hideDeliveryPartner ? undefined : riderReviewText.trim() || undefined,
          ...(!hideStoreRating && storeSelectedTags.length
            ? { storeReviewTags: storeSelectedTags }
            : {}),
          ...(!hideDeliveryPartner && riderSelectedTags.length
            ? { riderReviewTags: riderSelectedTags }
            : {}),
        })
      );
      setRatingSubmitted(true);
      setThankYouSheet({
        title: "Thank you!",
        message: "Your rating helps us improve. You can still add a tip below, or close anytime.",
        ctaLabel: canOfferTip ? "Continue" : "OK",
      });
    } catch {
      // Parent already surfaces the error.
    }
  };

  const tipCard =
    canOfferTip ? (
      <View style={styles.tipCard}>
        <AppText style={styles.tipTitle}>Tip your delivery partner</AppText>
        <AppText style={styles.tipSub}>
          Delivery partner will get notified instantly. The full tip is sent after delivery.
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
          <View style={styles.customTipWrap}>
            <AppText style={styles.customTipLabel}>Custom amount</AppText>
            <TextInput
              style={styles.customTipInput}
              keyboardType="number-pad"
              placeholder="Enter amount"
              placeholderTextColor="#9CA3AF"
              value={customTipAmount}
              onChangeText={setCustomTipAmount}
              maxLength={4}
            />
          </View>
        ) : null}

        <View style={styles.tipOptionsRow}>
          <TouchableOpacity
            style={styles.saveTipRow}
            onPress={() => setSaveTipForNext((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={saveTipForNext ? "checkbox" : "square-outline"}
              size={20}
              color={saveTipForNext ? GREEN : MUTED}
            />
            <AppText style={styles.saveTipText}>Save tip for next order</AppText>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClearTip} hitSlop={8}>
            <AppText style={styles.clearTipText}>Clear</AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.payFooter}>
          <TouchableOpacity
            style={styles.payMethodCol}
            onPress={() => {
              const next =
                TIP_PAY_METHODS.find((m) => m.id !== tipPayMethod)?.id ?? "upi";
              selectTipPayMethod(next);
            }}
            activeOpacity={0.85}
          >
            <AppText style={styles.payUsing}>PAY USING</AppText>
            <View style={styles.payMethodToggleRow}>
              <AppText style={styles.payMethod}>
                {TIP_PAY_METHODS.find((m) => m.id === tipPayMethod)?.label ?? "UPI"}
              </AppText>
              <Ionicons name="chevron-down" size={14} color={TEXT} />
            </View>
            {tipPayMethod === "gaticash" ? (
              <AppText style={styles.walletHint}>Bal ₹{Math.floor(walletAvailable)}</AppText>
            ) : canPayWithGatiCash ? (
              <AppText style={styles.walletHint}>Tap to use GatiCash</AppText>
            ) : (
              <AppText style={styles.walletHintMuted}>GatiCash unavailable</AppText>
            )}
          </TouchableOpacity>
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
    ) : !hideDeliveryPartner && paidTip > 0 ? (
      <View style={styles.tipPaidBanner}>
        <Ionicons name="heart" size={15} color={GREEN} />
        <AppText style={styles.tipPaidText}>You tipped ₹{Math.round(paidTip)}</AppText>
      </View>
    ) : null;

  return (
    <>
      <StoreBottomSheetShell
        visible={visible}
        onClose={onClose}
        maxHeightRatio={hideStoreRating ? 0.82 : 0.92}
        flushBottom
        keyboardAvoiding
        sheetStyle={{ height: sheetHeight }}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={22} color="#fff" />
            </View>
            <AppText style={styles.title}>
              {ratingSubmitted
                ? "Thanks for your feedback!"
                : hideDeliveryPartner
                  ? "Order collected!"
                  : hideStoreRating
                    ? "Parcel delivered!"
                    : "Order delivered!"}
            </AppText>
            <AppText style={styles.subtitle}>
              {ratingSubmitted
                ? canOfferTip
                  ? "Add an optional tip below, or close anytime."
                  : "You can close this sheet anytime."
                : hideDeliveryPartner
                  ? "Rate the restaurant."
                  : hideStoreRating
                    ? "How was your delivery partner?"
                    : "Rate the restaurant, delivery partner, or both."}
            </AppText>
          </View>

          {hideStoreRating ? null : (
            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Restaurant</AppText>
              <View style={styles.entityRow}>
                {storeBannerUri ? (
                  <Image
                    source={{ uri: storeBannerUri }}
                    style={styles.entityThumb}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.entityThumbFallback}>
                    <Ionicons name="restaurant-outline" size={18} color={MUTED} />
                  </View>
                )}
                <AppText style={styles.entityName} numberOfLines={2}>
                  {storeName}
                </AppText>
              </View>
              <AppText style={styles.rateHint}>How was the food?</AppText>
              <StarRow
                value={storeRating}
                onChange={ratingSubmitted ? () => {} : handleStoreRatingChange}
              />
              {storeRating >= 1 ? (
                <RatingTags
                  tags={RESTAURANT_RATING_TAGS}
                  selected={storeSelectedTags}
                  onToggle={ratingSubmitted ? () => {} : toggleStoreTag}
                />
              ) : null}
              <AppText style={styles.reviewLabel}>Review restaurant (optional)</AppText>
              <TextInput
                style={styles.reviewInput}
                placeholder={reviewText.length > 0 ? undefined : "Food quality, packaging, taste…"}
                placeholderTextColor={MUTED}
                value={reviewText}
                onChangeText={setReviewText}
                editable={!ratingSubmitted}
                multiline
                maxLength={500}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
                {...(Platform.OS === "android" ? { includeFontPadding: false } : null)}
              />
            </View>
          )}

          {hideDeliveryPartner ? null : (
            <View style={styles.section}>
              <AppText style={styles.sectionTitle}>Delivery partner</AppText>
              <View style={styles.entityRow}>
                <View style={[styles.entityThumbFallback, styles.riderThumb]}>
                  <Ionicons name="bicycle" size={20} color={GREEN} />
                </View>
                <AppText style={styles.entityName} numberOfLines={1}>
                  {partnerLabel}
                </AppText>
              </View>
              <AppText style={styles.rateHint}>How was the delivery?</AppText>
              <StarRow
                value={deliveryRating}
                onChange={ratingSubmitted ? () => {} : handleDeliveryRatingChange}
              />
              {deliveryRating >= 1 ? (
                <RatingTags
                  tags={DELIVERY_RATING_TAGS}
                  selected={riderSelectedTags}
                  onToggle={ratingSubmitted ? () => {} : toggleRiderTag}
                />
              ) : null}
              <AppText style={styles.reviewLabel}>Add a note (optional)</AppText>
              <TextInput
                style={styles.reviewInput}
                placeholder={
                  riderReviewText.length > 0
                    ? undefined
                    : "Delivery speed, behaviour, handling…"
                }
                placeholderTextColor={MUTED}
                value={riderReviewText}
                onChangeText={setRiderReviewText}
                editable={!ratingSubmitted}
                multiline
                maxLength={500}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
                {...(Platform.OS === "android" ? { includeFontPadding: false } : null)}
              />
            </View>
          )}

          {ratingSubmitted ? (
            <View style={styles.submittedBanner}>
              <Ionicons name="checkmark-circle" size={18} color={GREEN} />
              <AppText style={styles.submittedBannerText}>Rating submitted</AppText>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              disabled={!canSubmit}
              onPress={() => void handleSubmit()}
              activeOpacity={0.9}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <AppText style={styles.submitBtnText}>Submit rating</AppText>
              )}
            </TouchableOpacity>
          )}

          {tipCard}

          <TouchableOpacity
            style={styles.laterBtn}
            onPress={onClose}
            disabled={submitting || tipPaying}
            activeOpacity={0.8}
          >
            <AppText style={styles.laterBtnText}>
              {ratingSubmitted ? "Close" : "Maybe later"}
            </AppText>
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

      <Modal
        visible={thankYouSheet != null}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setThankYouSheet(null)}
      >
        <View style={styles.thanksRoot}>
          <Pressable
            style={styles.thanksBackdrop}
            onPress={() => setThankYouSheet(null)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          />
          <View
            style={[
              styles.thanksSheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            <View style={styles.thanksHandle} />
            <View style={styles.thanksCheck}>
              <Ionicons name="checkmark" size={34} color="#fff" />
            </View>
            <AppText style={styles.thanksTitle}>
              {thankYouSheet?.title ?? "Thank you!"}
            </AppText>
            <AppText style={styles.thanksMessage}>
              {thankYouSheet?.message ?? ""}
            </AppText>
            <TouchableOpacity
              style={styles.thanksCta}
              onPress={() => setThankYouSheet(null)}
              activeOpacity={0.9}
            >
              <AppText style={styles.thanksCtaText}>
                {thankYouSheet?.ctaLabel ?? "OK"}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 4,
    gap: 10,
  },
  header: { alignItems: "center", marginBottom: 2 },
  successIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 17,
    color: MUTED,
    textAlign: "center",
  },
  section: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: GREEN,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  entityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 2,
  },
  entityThumb: { width: 40, height: 40, borderRadius: 10 },
  entityThumbFallback: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#EEF2F0",
    alignItems: "center",
    justifyContent: "center",
  },
  riderThumb: { backgroundColor: "#E8F8EF" },
  entityName: { flex: 1, fontSize: 15, fontWeight: "700", color: TEXT },
  rateHint: { fontSize: 13, fontWeight: "600", color: TEXT, marginTop: 2 },
  starRow: { flexDirection: "row", gap: 6, marginVertical: 2 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
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
  reviewLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginTop: 4 },
  reviewInput: {
    minHeight: 64,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingTop: Platform.OS === "android" ? 10 : 9,
    paddingBottom: 9,
    fontSize: 14,
    lineHeight: 19,
    color: TEXT,
    backgroundColor: "#fff",
  },
  tipCard: {
    paddingTop: 4,
    paddingBottom: 2,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  tipTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  tipSub: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  tipRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
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
  customTipWrap: { marginBottom: 10 },
  customTipLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginBottom: 6 },
  customTipInput: {
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
  tipOptionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  saveTipRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  saveTipText: { fontSize: 13, color: TEXT, fontWeight: "500" },
  clearTipText: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.errorRed },
  payFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraColors.border,
  },
  payMethodCol: { flex: 1 },
  payUsing: { fontSize: 10, fontWeight: "700", color: MUTED, letterSpacing: 0.4 },
  payMethodToggleRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  payMethod: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    textTransform: "capitalize",
  },
  walletHint: { fontSize: 10, color: MINT_DARK, fontWeight: "600", marginTop: 2 },
  walletHintMuted: { fontSize: 10, color: MUTED, marginTop: 2 },
  payBtn: { borderRadius: 14, overflow: "hidden", minWidth: 152 },
  payBtnDisabled: { opacity: 0.55 },
  payBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  payBtnTotal: { fontSize: 14, fontWeight: "800", color: "#fff" },
  payBtnCta: { fontSize: 14, fontWeight: "700", color: "#fff" },
  tipPaidBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  tipPaidText: { fontSize: 13, fontWeight: "700", color: GREEN },
  submitBtn: {
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  submittedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  submittedBannerText: { fontSize: 15, fontWeight: "700", color: GREEN },
  laterBtn: { paddingVertical: 8, alignItems: "center" },
  laterBtnText: { fontSize: 14, fontWeight: "600", color: MUTED },
  thanksRoot: { flex: 1, justifyContent: "flex-end" },
  thanksBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  thanksSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 10,
    alignItems: "center",
  },
  thanksHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 18,
  },
  thanksCheck: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  thanksTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  thanksMessage: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "500",
    color: MUTED,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  thanksCta: {
    marginTop: 20,
    alignSelf: "stretch",
    backgroundColor: MINT_DARK,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  thanksCtaText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
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
