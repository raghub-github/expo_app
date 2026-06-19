/**
 * GatiMitra-style restaurant rating bottom sheet after delivery.
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

const MINT = GatiMitraColors.primaryMint;
const ACCENT = GatiMitraColors.warmOrange;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

function headlineForRating(rating: number): string {
  if (rating >= 5) return "We're glad you loved it";
  if (rating >= 4) return "Thanks for your feedback";
  if (rating >= 3) return "Tell us what could be better";
  return "We're sorry it missed the mark";
}

type RestaurantPostDeliveryRatingSheetProps = {
  visible: boolean;
  storeName: string;
  initialRating?: number;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: { storeRating: number; reviewText?: string; recommendFriends: boolean }) => void;
};

export function RestaurantPostDeliveryRatingSheet({
  visible,
  storeName,
  initialRating = 0,
  submitting = false,
  onClose,
  onSubmit,
}: RestaurantPostDeliveryRatingSheetProps) {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(initialRating);
  const [recommendFriends, setRecommendFriends] = useState(true);
  const [reviewText, setReviewText] = useState("");

  useEffect(() => {
    if (!visible) return;
    setRating(initialRating > 0 ? initialRating : 5);
    setRecommendFriends(true);
    setReviewText("");
  }, [visible, initialRating]);

  const headline = useMemo(() => headlineForRating(rating), [rating]);
  const canSubmit = rating >= 1 && !submitting;

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.82}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        <Text style={styles.headline}>{headline}</Text>
        <Text style={styles.storeName}>{storeName}</Text>

        <TouchableOpacity
          style={styles.recommendRow}
          onPress={() => setRecommendFriends((v) => !v)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={recommendFriends ? "checkbox" : "square-outline"}
            size={22}
            color={recommendFriends ? ACCENT : MUTED}
          />
          <View style={styles.recommendTextWrap}>
            <Text style={styles.recommendTitle}>I recommend it to my friends</Text>
            <Text style={styles.recommendSub}>
              Restaurant and dishes in this order will appear as a recommendation to friends who
              have your contact.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.noteLabel}>Send a note to the restaurant</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="Add your thoughts here"
          placeholderTextColor="#9CA3AF"
          value={reviewText}
          onChangeText={setReviewText}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.photoRow} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={20} color={MUTED} />
          <Text style={styles.photoText}>Add photo</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          disabled={!canSubmit}
          onPress={() =>
            onSubmit({
              storeRating: rating,
              reviewText: reviewText.trim() || undefined,
              recommendFriends,
            })
          }
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Submit</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  starsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  headline: {
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  storeName: {
    fontSize: 15,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 18,
  },
  recommendRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  recommendTextWrap: { flex: 1 },
  recommendTitle: { fontSize: 14, fontWeight: "700", color: TEXT },
  recommendSub: { fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 4 },
  noteLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  noteInput: {
    marginHorizontal: 20,
    minHeight: 88,
    borderWidth: 1,
    borderColor: GatiMitraColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FAFAFA",
    marginBottom: 12,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  photoText: { fontSize: 14, fontWeight: "600", color: MUTED },
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
