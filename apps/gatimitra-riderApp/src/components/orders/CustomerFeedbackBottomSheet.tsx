import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

const SUBMIT_GREEN = colors.success[500];
const SKIP_PINK = "#E11D48";
const REF_BLUE = "#2563EB";
const DEFAULT_RATING = 5;

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
  const { height, isShortHeight, insets, rs } = useResponsiveLayout();
  const [rating, setRating] = useState<number>(DEFAULT_RATING);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");

  const availableTags = useMemo(() => tagsForRating(rating), [rating]);
  const bottomPad = resolveRiderBottomInset(insets.bottom) + rs(8);
  const bodyMaxH = Math.round(height * (isShortHeight ? 0.72 : 0.64));

  useEffect(() => {
    if (!visible) return;
    setRating(DEFAULT_RATING);
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

  const canSubmit = !loading;

  const handleSubmit = () => {
    if (!canSubmit) return;
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
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onSkip}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={loading ? undefined : onSkip}
          accessibilityRole="button"
          accessibilityLabel={t("orders.activeFood.feedbackSkip", "Skip")}
        />

        <View style={[styles.sheet, { maxHeight: Math.round(height * 0.88) }]}>
          <View style={styles.handle} />

          <View style={[rowLayout.row, styles.header]}>
            <View style={[styles.headerTextCol, rowLayout.grow]}>
              <Text style={[styles.title, flexShrinkText]} numberOfLines={1}>
                {t("orders.activeFood.customerFeedbackTitle", "Customer Feedback")}
              </Text>
              <Text style={[styles.lead, flexShrinkText]} numberOfLines={1}>
                {t("orders.activeFood.customerFeedbackLead", "You just delivered an order")}
              </Text>
            </View>
            <Pressable
              onPress={onSkip}
              disabled={loading}
              hitSlop={10}
              style={[styles.skipBtn, rowLayout.noShrink]}
              accessibilityRole="button"
              accessibilityLabel={t("orders.activeFood.feedbackSkip", "Skip")}
            >
              <Text style={styles.skipText} numberOfLines={1}>
                {t("orders.activeFood.feedbackSkip", "Skip")}
              </Text>
            </Pressable>
          </View>

          <ResponsiveSheetBody
            maxHeight={bodyMaxH}
            contentContainerStyle={styles.scrollContent}
            footerStyle={styles.footerSlot}
            footerBottomInset={bottomPad}
            footer={
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel={t("orders.activeFood.feedbackSubmit", "Submit")}
              >
                <Text style={styles.submitText} numberOfLines={1}>
                  {loading
                    ? t("orders.activeFood.feedbackSubmitting", "Submitting…")
                    : t("orders.activeFood.feedbackSubmit", "Submit")}
                </Text>
              </Pressable>
            }
          >
            <View style={[rowLayout.row, styles.infoCard]}>
              <View style={[styles.orderIcon, rowLayout.noShrink]}>
                <Ionicons name="person" size={16} color="#fff" />
              </View>
              <View style={[styles.orderTextCol, rowLayout.grow]}>
                <Text style={[styles.orderIdLine, flexShrinkText]} numberOfLines={1}>
                  {t("orders.activeFood.orderIdLabel", "Order ID")}: {orderIdLabel}
                </Text>
                <Text style={[styles.customerName, flexShrinkText]} numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, flexShrinkText]} numberOfLines={2}>
              {t(
                "orders.activeFood.customerRatingPrompt",
                "Rate your experience with the customer"
              )}
            </Text>

            <View style={[rowLayout.row, styles.emojiRow]}>
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

            <Text style={[styles.sectionLabel, flexShrinkText]} numberOfLines={1}>
              {t("orders.activeFood.customerFeedbackImprove", "Tell us more")}
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
                    <Text
                      style={[styles.tagText, active && styles.tagTextActive, flexShrinkText]}
                      numberOfLines={1}
                    >
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
                "Add a comment (optional)"
              )}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!loading}
            />
          </ResponsiveSheetBody>
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
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
    width: "100%",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOpacity: 0.14,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 8,
  },
  header: {
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "flex-start",
    maxWidth: "100%",
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  lead: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "500",
  },
  skipBtn: {
    marginTop: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#FFF1F2",
  },
  skipText: {
    fontSize: 13,
    fontWeight: "700",
    color: SKIP_PINK,
  },
  scrollContent: {
    paddingBottom: 4,
    paddingHorizontal: 16,
  },
  footerSlot: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8EAED",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  infoCard: {
    gap: 10,
    marginBottom: 12,
    maxWidth: "100%",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8EAED",
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  orderIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: REF_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  orderTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 1,
  },
  orderIdLine: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748B",
  },
  customerName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  sectionLabel: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 8,
    fontWeight: "700",
  },
  emojiRow: {
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 6,
    maxWidth: "100%",
  },
  emojiBtn: {
    flex: 1,
    minWidth: 0,
    height: 44,
    maxWidth: 52,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  emojiBtnSelected: {
    borderColor: SUBMIT_GREEN,
    backgroundColor: colors.success[50],
  },
  emoji: {
    fontSize: 22,
  },
  tagsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
    maxWidth: "100%",
  },
  tagPill: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "#fff",
    maxWidth: "100%",
  },
  tagPillActive: {
    borderColor: SUBMIT_GREEN,
    backgroundColor: colors.success[50],
  },
  tagText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  tagTextActive: {
    color: "#166534",
  },
  commentInput: {
    minHeight: 64,
    maxHeight: 88,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
    marginBottom: 4,
    maxWidth: "100%",
  },
  submitBtn: {
    backgroundColor: SUBMIT_GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.55,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
