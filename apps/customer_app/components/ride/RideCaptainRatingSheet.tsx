/**
 * Bottom sheet for rating a ride captain after trip completion.
 */

import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  RIDE_CAPTAIN_RATING_TAGS,
  defaultTagsForRating,
} from "@/lib/post-delivery-rating-tags";

const MINT_DARK = GatiMitraColors.deepMintStart;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

function headlineForRating(rating: number): string {
  if (rating >= 5) return "Glad you had a great ride";
  if (rating >= 4) return "Thanks for your feedback";
  if (rating >= 3) return "Tell us what could be better";
  return "We're sorry the ride missed the mark";
}

export type RideCaptainRatingSubmitPayload = {
  deliveryRating: number;
  riderReviewTags: string[];
  riderReviewText: string | null;
};

type Props = {
  visible: boolean;
  captainName: string;
  initialRating?: number;
  initialTags?: string[];
  initialReviewText?: string;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: RideCaptainRatingSubmitPayload) => void;
};

export function RideCaptainRatingSheet({
  visible,
  captainName,
  initialRating = 0,
  initialTags = [],
  initialReviewText = "",
  submitting = false,
  onClose,
  onSubmit,
}: Props) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(initialRating);
  const [selectedTags, setSelectedTags] = useState<string[]>(initialTags);
  const [reviewText, setReviewText] = useState(initialReviewText);

  useEffect(() => {
    if (!visible) return;
    const nextRating = initialRating > 0 ? initialRating : 5;
    setRating(nextRating);
    setSelectedTags(
      initialTags.length > 0 ? initialTags : defaultTagsForRating(RIDE_CAPTAIN_RATING_TAGS, nextRating)
    );
    setReviewText(initialReviewText);
  }, [visible, initialRating, initialTags, initialReviewText]);

  const headline = useMemo(() => headlineForRating(rating), [rating]);
  const canSubmit = rating >= 1 && !submitting;

  const handleRatingChange = (stars: number) => {
    setRating(stars);
    setSelectedTags(defaultTagsForRating(RIDE_CAPTAIN_RATING_TAGS, stars));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.84}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sheetTitle}>Rate your captain</Text>

        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => handleRatingChange(n)} hitSlop={6}>
              <Ionicons
                name={n <= rating ? "star" : "star-outline"}
                size={38}
                color={n <= rating ? "#F59E0B" : "#D1D5DB"}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.captainName}>{captainName}</Text>

        <Text style={styles.prompt}>What stood out?</Text>
        <View style={styles.tagsWrap}>
          {RIDE_CAPTAIN_RATING_TAGS.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tag, active && styles.tagActive]}
                onPress={() => toggleTag(tag)}
                activeOpacity={0.85}
              >
                <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.noteLabel}>Write a review (optional)</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Share your ride experience"
          placeholderTextColor="#9CA3AF"
          value={reviewText}
          onChangeText={setReviewText}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({
              deliveryRating: rating,
              riderReviewTags: selectedTags,
              riderReviewText: reviewText.trim() || null,
            })
          }
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit rating</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
    marginBottom: 16,
  },
  headline: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  captainName: {
    fontSize: 14,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
    fontWeight: "600",
  },
  prompt: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 18,
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
    borderColor: MINT_DARK,
    backgroundColor: "#ECFDF5",
  },
  tagText: { fontSize: 13, fontWeight: "600", color: TEXT },
  tagTextActive: { color: MINT_DARK },
  noteLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  noteInput: {
    marginHorizontal: 20,
    minHeight: 96,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FAFAFA",
    marginBottom: 20,
  },
  submitBtn: {
    marginHorizontal: 20,
    backgroundColor: MINT_DARK,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { fontSize: 16, fontWeight: "700", color: "#fff" },
});
