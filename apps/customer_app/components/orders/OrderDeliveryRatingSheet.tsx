import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

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
              size={30}
              color={filled ? "#F59E0B" : "#D1D5DB"}
            />
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
    storeRating: number;
    deliveryRating: number;
    reviewText?: string;
    riderReviewText?: string;
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
  const [storeRating, setStoreRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [riderReviewText, setRiderReviewText] = useState("");
  const [selectedTip, setSelectedTip] = useState<number | null>(null);

  const showTipOption = checkoutTipAmount <= 0;

  useEffect(() => {
    if (!visible) return;
    setStoreRating(0);
    setDeliveryRating(0);
    setReviewText("");
    setRiderReviewText("");
    setSelectedTip(null);
  }, [visible]);

  const canSubmit = storeRating >= 1 && deliveryRating >= 1 && !submitting;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.88} flushBottom>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={28} color={GREEN} />
          </View>
          <Text style={styles.title}>Order delivered!</Text>
          <Text style={styles.subtitle}>Rate your restaurant and delivery partner.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Restaurant</Text>
          <View style={styles.entityRow}>
            {storeBannerUri ? (
              <Image source={{ uri: storeBannerUri }} style={styles.entityThumb} resizeMode="cover" />
            ) : (
              <View style={styles.entityThumbFallback}>
                <Ionicons name="restaurant-outline" size={20} color={MUTED} />
              </View>
            )}
            <Text style={styles.entityName} numberOfLines={2}>
              {storeName}
            </Text>
          </View>
          <Text style={styles.rateHint}>How was the food?</Text>
          <StarRow value={storeRating} onChange={setStoreRating} />
          <Text style={styles.reviewLabel}>Review restaurant (optional)</Text>
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
          <Text style={styles.sectionTitle}>Delivery partner</Text>
          <View style={styles.entityRow}>
            <View style={[styles.entityThumbFallback, styles.riderThumb]}>
              <Ionicons name="bicycle" size={22} color={GREEN} />
            </View>
            <Text style={styles.entityName} numberOfLines={1}>
              {riderName?.trim() || "Your GatiMitra rider"}
            </Text>
          </View>
          <Text style={styles.rateHint}>How was the delivery?</Text>
          <StarRow value={deliveryRating} onChange={setDeliveryRating} />
          <Text style={styles.reviewLabel}>Review delivery (optional)</Text>
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
              <Text style={styles.tipTitle}>Say thanks with a tip</Text>
              <Text style={styles.tipSubtitle}>You did not add a tip at checkout.</Text>
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
                      <Text style={[styles.tipChipText, active && styles.tipChipTextActive]}>
                        ₹{amount}
                      </Text>
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
          onPress={() =>
            onSubmit({
              storeRating,
              deliveryRating,
              reviewText: reviewText.trim() || undefined,
              riderReviewText: riderReviewText.trim() || undefined,
              ...(selectedTip != null && selectedTip > 0 ? { riderTipAmount: selectedTip } : {}),
            })
          }
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Submit rating</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.laterBtn} onPress={onClose} disabled={submitting} activeOpacity={0.8}>
          <Text style={styles.laterBtnText}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8 },
  header: { alignItems: "center", marginBottom: 16 },
  successIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: "700", color: TEXT, textAlign: "center" },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  section: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F8FAF9",
    borderWidth: 1,
    borderColor: "#E8F5EE",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: GREEN,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  entityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
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
  rateHint: { fontSize: 13, fontWeight: "600", color: TEXT, marginBottom: 8 },
  starRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
  reviewLabel: { fontSize: 12, fontWeight: "600", color: MUTED, marginBottom: 6, marginTop: 4 },
  reviewInput: {
    minHeight: 72,
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
    borderTopColor: "#E5E7EB",
  },
  tipTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  tipSubtitle: { fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 10 },
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
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  laterBtn: { marginTop: 12, paddingVertical: 10, alignItems: "center" },
  laterBtnText: { fontSize: 14, fontWeight: "600", color: MUTED },
});
