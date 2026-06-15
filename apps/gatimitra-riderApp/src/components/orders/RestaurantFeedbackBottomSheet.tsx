import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";

const SUBMIT_GREEN = colors.success[500];
const SKIP_PINK = "#E85D75";

type FeedbackTag = {
  id: string;
  labelKey: string;
  fallback: string;
};

const POSITIVE_TAGS: FeedbackTag[] = [
  { id: "order_given_on_time", labelKey: "orders.activeFood.feedbackTagOnTime", fallback: "Order given on time" },
  { id: "merchant_was_nice", labelKey: "orders.activeFood.feedbackTagNice", fallback: "Merchant was nice" },
  { id: "pickup_experience_good", labelKey: "orders.activeFood.feedbackTagPickupGood", fallback: "Smooth pickup experience" },
  { id: "waiting_time_ok", labelKey: "orders.activeFood.feedbackTagWaitOk", fallback: "Waiting time was fine" },
];

const NEUTRAL_TAGS: FeedbackTag[] = [
  { id: "waiting_time_long", labelKey: "orders.activeFood.feedbackTagWaitLong", fallback: "Long waiting time" },
  { id: "long_wait_time", labelKey: "orders.activeFood.feedbackTagLongWait", fallback: "Long wait time" },
  { id: "order_not_ready", labelKey: "orders.activeFood.feedbackTagNotReady", fallback: "Order not ready" },
];

const NEGATIVE_TAGS: FeedbackTag[] = [
  { id: "long_wait_time", labelKey: "orders.activeFood.feedbackTagLongWait", fallback: "Long wait time" },
  { id: "order_not_ready", labelKey: "orders.activeFood.feedbackTagNotReady", fallback: "Order not ready" },
  { id: "rude_behavior", labelKey: "orders.activeFood.feedbackTagRude", fallback: "Rude behavior" },
  { id: "wrong_items", labelKey: "orders.activeFood.feedbackTagWrongItems", fallback: "Wrong items" },
];

const RATING_EMOJIS = ["😠", "😕", "😐", "🙂", "😍"] as const;

type Props = {
  visible: boolean;
  loading?: boolean;
  restaurantName: string;
  restaurantAddress: string;
  onSkip: () => void;
  onSubmit: (payload: { rating: number; tags: string[]; messages: string[] }) => void;
};

function tagsForRating(rating: number | null): FeedbackTag[] {
  if (rating == null) return POSITIVE_TAGS;
  if (rating >= 4) return POSITIVE_TAGS;
  if (rating === 3) return NEUTRAL_TAGS;
  return NEGATIVE_TAGS;
}

export function RestaurantFeedbackBottomSheet({
  visible,
  loading = false,
  restaurantName,
  restaurantAddress,
  onSkip,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState<number | null>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const availableTags = useMemo(() => tagsForRating(rating), [rating]);
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 20 : 16);

  useEffect(() => {
    if (!visible) return;
    setRating(5);
    setSelectedTags([]);
  }, [visible]);

  useEffect(() => {
    setSelectedTags((prev) => prev.filter((id) => availableTags.some((tag) => tag.id === id)));
  }, [availableTags]);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
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
      <View style={styles.root}>
        <View style={styles.backdrop} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        <View style={[styles.sheet, { paddingBottom: bottomPad }]}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {t("orders.activeFood.restaurantFeedbackTitle", "Restaurant feedback")}
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
          >
            <Text style={styles.lead}>
              {t(
                "orders.activeFood.restaurantFeedbackLead",
                "How was your pickup experience?"
              )}
            </Text>

            <View style={styles.restaurantRow}>
              <View style={styles.restaurantIcon}>
                <Ionicons name="restaurant" size={22} color="#fff" />
              </View>
              <View style={styles.restaurantTextWrap}>
                <Text style={styles.restaurantName} numberOfLines={2}>
                  {restaurantName}
                </Text>
                <Text style={styles.restaurantAddress} numberOfLines={3}>
                  {restaurantAddress}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>
              {t("orders.activeFood.merchantRatingLabel", "Merchant rating")}
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
              {t("orders.activeFood.pickupExperienceLabel", "Pickup experience & waiting time")}
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
          </ScrollView>

          <Pressable
            onPress={() => {
              if (!canSubmit || rating == null) return;
              const messages = selectedTags.map((id) => {
                const tag = availableTags.find((item) => item.id === id);
                return tag ? t(tag.labelKey, tag.fallback) : id;
              });
              onSubmit({ rating, tags: selectedTags, messages });
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
      </View>
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
    maxHeight: "88%",
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
  restaurantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  restaurantIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.secondary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  restaurantTextWrap: {
    flex: 1,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  restaurantAddress: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
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
    marginBottom: 16,
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
