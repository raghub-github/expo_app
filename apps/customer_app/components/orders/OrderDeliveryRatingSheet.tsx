import { useEffect, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Image, TextInput, ActivityIndicator, ScrollView, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  RESTAURANT_RATING_TAGS,
  DELIVERY_RATING_TAGS,
  defaultTagsForRating,
} from "@/lib/post-delivery-rating-tags";

const GREEN = GatiMitraColors.primaryMint;
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const TIP_PRESETS = [20, 40, 60] as const;

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
  storeName: string;
  storeBannerUri?: string | null;
  riderName?: string | null;
  /** Tip already paid at checkout; hide post-delivery tip when > 0 */
  checkoutTipAmount?: number;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    storeRating?: number;
    deliveryRating?: number;
    reviewText?: string;
    riderReviewText?: string;
    storeReviewTags?: string[];
    riderReviewTags?: string[];
    riderTipAmount?: number;
  }) => void;
};

export function OrderDeliveryRatingSheet({
  visible,
  storeName,
  storeBannerUri,
  riderName,
  checkoutTipAmount = 0,
  submitting = false,
  onClose,
  onSubmit,
}: OrderDeliveryRatingSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const sheetHeight = Math.round(winH * 0.86);
  const [storeRating, setStoreRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [storeSelectedTags, setStoreSelectedTags] = useState<string[]>([]);
  const [riderSelectedTags, setRiderSelectedTags] = useState<string[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [riderReviewText, setRiderReviewText] = useState("");
  const [selectedTip, setSelectedTip] = useState<number | null>(null);

  const showTipOption = checkoutTipAmount <= 0;

  useEffect(() => {
    if (!visible) return;
    setStoreRating(0);
    setDeliveryRating(0);
    setStoreSelectedTags([]);
    setRiderSelectedTags([]);
    setReviewText("");
    setRiderReviewText("");
    setSelectedTip(null);
  }, [visible]);

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

  const hasStoreRating = storeRating >= 1;
  const hasDeliveryRating = deliveryRating >= 1;
  const canSubmit = (hasStoreRating || hasDeliveryRating) && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      ...(hasStoreRating ? { storeRating } : {}),
      ...(hasDeliveryRating ? { deliveryRating } : {}),
      reviewText: reviewText.trim() || undefined,
      riderReviewText: riderReviewText.trim() || undefined,
      ...(storeSelectedTags.length ? { storeReviewTags: storeSelectedTags } : {}),
      ...(riderSelectedTags.length ? { riderReviewTags: riderSelectedTags } : {}),
      ...(selectedTip != null && selectedTip > 0 ? { riderTipAmount: selectedTip } : {}),
    });
  };

  return (
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
              {riderName?.trim() || "Your GatiMitra rider"}
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

          {showTipOption ? (
            <View style={styles.tipBlock}>
              <AppText style={styles.tipTitle}>Say thanks with a tip</AppText>
              <AppText style={styles.tipSubtitle}>You did not add a tip at checkout.</AppText>
              <View style={styles.tipRow}>
                {TIP_PRESETS.map((amount) => {
                  const active = selectedTip === amount;
                  return (
                    <TouchableOpacity
                      key={amount}
                      style={[styles.tipChip, active && styles.tipChipActive]}
                      onPress={() => setSelectedTip(active ? null : amount)}
                      activeOpacity={0.85}
                    >
                      <AppText style={[styles.tipChipText, active && styles.tipChipTextActive]}>
                        ₹{amount}
                      </AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
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
          disabled={submitting}
          activeOpacity={0.8}
        >
          <AppText style={styles.laterBtnText}>Maybe later</AppText>
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
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
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  tipTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  tipSubtitle: { fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 8 },
  tipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tipChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  tipChipActive: {
    borderColor: GatiMitraColors.warmOrange,
    backgroundColor: "#FFF7ED",
  },
  tipChipText: { fontSize: 14, fontWeight: "700", color: TEXT },
  tipChipTextActive: { color: GatiMitraColors.warmOrange },
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
});
