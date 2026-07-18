/**
 * GatiMitra-style delivery partner rating bottom sheet with feedback tags.
 */

import { useEffect, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

const ACCENT = GatiMitraColors.warmOrange;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

export const DELIVERY_RATING_TAGS = [
  "Fast delivery",
  "Polite attitude",
  "Location awareness",
  "Responsive",
  "Neat & Clean",
  "Food handling",
  "Minimal calling",
] as const;

type DeliveryPartnerPostRatingSheetProps = {
  visible: boolean;
  partnerName: string;
  initialRating?: number;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { deliveryRating: number; tags: string[] }) => void;
};

export function DeliveryPartnerPostRatingSheet({
  visible,
  partnerName,
  initialRating = 0,
  submitting = false,
  onClose,
  onSubmit,
}: DeliveryPartnerPostRatingSheetProps) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(initialRating);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    setRating(initialRating > 0 ? initialRating : 5);
    setSelectedTags([]);
  }, [visible, initialRating]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const canSubmit = rating >= 1 && !submitting;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.78}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}>
        <AppText style={styles.thanks}>Thank you for rating!</AppText>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)} hitSlop={6}>
              <Ionicons
                name={n <= rating ? "star" : "star-outline"}
                size={36}
                color={n <= rating ? "#F59E0B" : "#D1D5DB"}
              />
            </TouchableOpacity>
          ))}
        </View>

        <AppText style={styles.prompt}>What did you like?</AppText>
        <AppText style={styles.partnerHint}>Rating {partnerName}</AppText>

        <View style={styles.tagsWrap}>
          {DELIVERY_RATING_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tag, active && styles.tagActive]}
                onPress={() => toggleTag(tag)}
                activeOpacity={0.85}
              >
                <AppText style={[styles.tagText, active && styles.tagTextActive]}>{tag}</AppText>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          disabled={!canSubmit}
          onPress={() => onSubmit({ deliveryRating: rating, tags: selectedTags })}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <AppText style={styles.submitText}>Submit rating</AppText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  thanks: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 12,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
  },
  prompt: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  partnerHint: {
    fontSize: 13,
    color: MUTED,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  tag: {
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  tagActive: {
    borderColor: ACCENT,
    backgroundColor: "#FFF7ED",
  },
  tagText: { fontSize: 13, fontWeight: "600", color: TEXT },
  tagTextActive: { color: ACCENT },
  submitBtn: {
    marginHorizontal: 20,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
