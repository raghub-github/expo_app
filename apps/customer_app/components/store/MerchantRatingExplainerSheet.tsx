import React from "react";
import { View, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "./StoreBottomSheetShell";
import { StoreTheme } from "@/constants/storeTheme";
import { ratingBadgeColors, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";
import { AppText } from "@/components/AppText";

export type MerchantRatingExplainerSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeName: string;
  overallRating: number | null;
  totalReviews: number | null;
  forYouRating: number | null;
  userHasRatedStore: boolean;
};

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K+`;
  return `${n}+`;
}

function RatingPill({
  value,
  label,
  isNew,
}: {
  value: number | null;
  label: string;
  isNew?: boolean;
}) {
  const hasRating = !isNew && value != null && Number.isFinite(value);
  const colors = ratingBadgeColors(hasRating ? value : null);
  const display = isNew || !hasRating ? "New" : Number(value).toFixed(1);
  const textColor = colors.low ? "#713F12" : "#FFFFFF";

  return (
    <View style={styles.ratingCol}>
      <View style={[styles.ratingPill, { backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN }]}>
        {hasRating ? <Ionicons name="star" size={11} color={textColor} /> : null}
        <AppText style={[styles.ratingPillText, { color: textColor }]}>{display}</AppText>
      </View>
      <AppText style={styles.ratingColLabel}>{label}</AppText>
    </View>
  );
}

export function MerchantRatingExplainerSheet({
  visible,
  onClose,
  storeName,
  overallRating,
  totalReviews,
  forYouRating,
  userHasRatedStore,
}: MerchantRatingExplainerSheetProps) {
  const insets = useSafeAreaInsets();
  const reviewLabel =
    totalReviews != null && totalReviews > 0
      ? `Overall rating (${formatReviewCount(totalReviews)})`
      : "Overall rating";

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.72} flushBottom>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.handle} />
        <AppText style={styles.title} numberOfLines={2}>
          {storeName}
        </AppText>

        <View style={styles.compareRow}>
          <RatingPill value={overallRating} label={reviewLabel} />
          <View style={styles.compareDivider} />
          <RatingPill
            value={forYouRating}
            label="For you"
            isNew={!userHasRatedStore}
          />
        </View>

        <AppText style={styles.sectionHeading}>HOW ARE RATINGS CALCULATED?</AppText>

        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="star-outline" size={18} color={StoreTheme.textSecondary} />
          </View>
          <AppText style={styles.infoText}>
            Overall ratings are powered by a proprietary algorithm, its based on weighted average
            that factors in recency and filters out spam.
          </AppText>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="heart-outline" size={18} color={StoreTheme.textSecondary} />
          </View>
          <AppText style={styles.infoText}>
            Ratings for you are based on your past orders, and matched with customers who&apos;ve
            similar tastes and preferences.
          </AppText>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.ctaBtn, { marginBottom: Math.max(insets.bottom, 16) }]}
        onPress={onClose}
        activeOpacity={0.88}
      >
        <AppText style={styles.ctaBtnText}>Got it!</AppText>
      </TouchableOpacity>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    textAlign: "center",
    marginBottom: 20,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 24,
  },
  compareDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: StoreTheme.border,
    marginHorizontal: 24,
    minHeight: 56,
  },
  ratingCol: {
    flex: 1,
    alignItems: "center",
    gap: 8,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ratingPillText: {
    fontSize: 14,
    fontWeight: "700",
  },
  ratingColLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    textAlign: "center",
    lineHeight: 16,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    color: StoreTheme.textMuted,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  infoIconWrap: {
    width: 28,
    alignItems: "center",
    paddingTop: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: StoreTheme.textPrimary,
    fontWeight: "400",
  },
  ctaBtn: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: StoreTheme.accentMint,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
