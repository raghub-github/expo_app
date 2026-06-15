import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

const SUBMIT_GREEN = colors.success[500];
const SKIP_PINK = "#E85D75";
const REF_BLUE = "#1A73E8";

type FeedbackTag = {
  id: string;
  labelKey: string;
  fallback: string;
};

const POSITIVE_TAGS: FeedbackTag[] = [
  { id: "polite_customer", labelKey: "orders.activeFood.cxTagPolite", fallback: "Polite & cooperative" },
  { id: "clear_instructions", labelKey: "orders.activeFood.cxTagClearInstructions", fallback: "Clear delivery instructions" },
  { id: "easy_to_find", labelKey: "orders.activeFood.cxTagEasyFind", fallback: "Easy to find location" },
  { id: "quick_handover", labelKey: "orders.activeFood.cxTagQuickHandover", fallback: "Quick handover" },
];

const NEUTRAL_TAGS: FeedbackTag[] = [
  { id: "long_wait_at_door", labelKey: "orders.activeFood.cxTagLongWait", fallback: "Long wait at door" },
  { id: "hard_to_find", labelKey: "orders.activeFood.cxTagHardFind", fallback: "Hard to find address" },
];

const NEGATIVE_TAGS: FeedbackTag[] = [
  { id: "rude_customer", labelKey: "orders.activeFood.cxTagRude", fallback: "Rude or unresponsive" },
  { id: "wrong_address", labelKey: "orders.activeFood.cxTagWrongAddress", fallback: "Wrong address given" },
  { id: "customer_unreachable", labelKey: "orders.activeFood.cxTagUnreachable", fallback: "Customer unreachable" },
];

const RATING_EMOJIS = ["😠", "😕", "😐", "🙂", "😍"] as const;

type Props = {
  visible: boolean;
  loading?: boolean;
  orderIdLabel: string;
  customerName: string;
  onSkip: () => void;
  onSubmit: (payload: {
    rating: number;
    tags: string[];
    messages: string[];
    comment?: string;
  }) => void;
};

function tagsForRating(rating: number | null): FeedbackTag[] {
  if (rating == null) return POSITIVE_TAGS;
  if (rating >= 4) return POSITIVE_TAGS;
  if (rating === 3) return NEUTRAL_TAGS;
  return NEGATIVE_TAGS;
}

export function CustomerFeedbackBottomSheet({
  visible,
  loading = false,
  orderIdLabel,
  customerName,
  onSkip,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState<number | null>(4);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const availableTags = useMemo(() => tagsForRating(rating), [rating]);
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 20 : 16);

  useEffect(() => {
    if (!visible) return;
    setRating(4);
    setSelectedTags([]);
    setComment("");
  }, [visible]);

  useEffect(() => {
    setSelectedTags((prev) => prev.filter((id) => availableTags.some((tag) => tag.id === id)));
  }, [availableTags]);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canSubmit = rating != null && !loading;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={() => undefined}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.backdrop} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        <View style={[styles.sheet, { paddingBottom: bottomPad }]}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t("orders.activeFood.customerFeedbackTitle", "Customer Feedback")}
            </Text>
            <Pressable
              onPress={onSkip}
              disabled={loading}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t("orders.activeFood.feedbackSkip", "Skip")}
            >
              <Text style={styles.skipText}>{t("orders.activeFood.feedbackSkip", "Skip")}</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.lead}>
              {t("orders.activeFood.customerFeedbackLead", "You just delivered an order")}
            </Text>

            <View style={styles.orderRow}>
              <View style={styles.orderIcon}>
                <Ionicons name="home" size={22} color="#fff" />
              </View>
              <View style={styles.orderTextCol}>
                <Text style={styles.orderIdLine}>
                  {t("orders.activeFood.orderIdLabel", "Order ID")}: {orderIdLabel}
                </Text>
                <Text style={styles.customerName} numberOfLines={2}>
                  {customerName}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>
              {t(
                "orders.activeFood.customerRatingPrompt",
                "Please rate your experience with the customer"
              )}
            </Text>

            <View style={styles.emojiRow}>
              {RATING_EMOJIS.map((emoji, index) => {
                const value = index + 1;
                const selected = rating === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setRating(value)}
                    disabled={loading}
                    style={[styles.emojiBtn, selected && styles.emojiBtnSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>
              {t("orders.activeFood.customerFeedbackImprove", "Tell us more so we can improve")}
            </Text>

            <View style={styles.tagsWrap}>
              {availableTags.map((tag) => {
                const active = selectedTags.includes(tag.id);
                return (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleTag(tag.id)}
                    disabled={loading}
                    style={[styles.tagPill, active && styles.tagPillActive]}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>
                      {t(tag.labelKey, tag.fallback)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.commentInput}
              value={comment}
              onChangeText={setComment}
              placeholder={t(
                "orders.activeFood.customerFeedbackCommentPlaceholder",
                "Add your comment here..."
              )}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </ScrollView>

          <Pressable
            onPress={() => {
              if (!canSubmit || rating == null) return;
              const trimmedComment = comment.trim();
              const messages = selectedTags.map((id) => {
                const tag = availableTags.find((item) => item.id === id);
                return tag ? t(tag.labelKey, tag.fallback) : id;
              });
              if (trimmedComment) messages.push(trimmedComment);
              onSubmit({
                rating,
                tags: selectedTags,
                messages,
                comment: trimmedComment || undefined,
              });
            }}
            disabled={!canSubmit}
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t("orders.activeFood.feedbackSubmit", "Submit")}
          >
            <Text style={styles.submitText}>
              {loading
                ? t("orders.activeFood.feedbackSubmitting", "Submitting…")
                : t("orders.activeFood.feedbackSubmit", "Submit")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    paddingRight: 12,
  },
  skipText: {
    fontSize: 16,
    fontWeight: "600",
    color: SKIP_PINK,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  lead: {
    fontSize: 15,
    color: "#374151",
    marginBottom: 14,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  orderIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: REF_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  orderTextCol: {
    flex: 1,
    minWidth: 0,
  },
  orderIdLine: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  customerName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 15,
    color: "#374151",
    marginBottom: 14,
  },
  emojiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 22,
    gap: 8,
  },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  emojiBtnSelected: {
    borderColor: SUBMIT_GREEN,
    backgroundColor: colors.success[50],
  },
  emoji: {
    fontSize: 26,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  tagPill: {
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  tagPillActive: {
    borderColor: SUBMIT_GREEN,
    backgroundColor: colors.success[50],
  },
  tagText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "500",
  },
  tagTextActive: {
    color: "#166534",
  },
  commentInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F9FAFB",
    marginBottom: 8,
  },
  submitBtn: {
    marginTop: 8,
    backgroundColor: SUBMIT_GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
