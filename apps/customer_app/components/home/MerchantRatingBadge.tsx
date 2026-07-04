/**
 * GatiMitra-style rating pill — tap "By X+" opens rating explainer sheet.
 */

import { useMemo } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ratingBadgeColors, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";
import { StoreText } from "@/components/store/StoreText";

type Props = {
  rating: number | null | undefined;
  totalReviews?: number | null;
  size?: "xs" | "sm" | "md";
  showReviewHint?: boolean;
  variant?: "overlay" | "inline";
  compact?: boolean;
  cutout?: boolean;
  onReviewHintPress?: () => void;
};

const HINT_TRACK_H = 14;
const PILL_W_MD = 54;
const PILL_W_SM = 48;
const STAR_BUBBLE = 15;
const PILL_H_MD = 26;
const PILL_H_SM = 22;

function formatReviewCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K+`;
  return `${n}+`;
}

export function MerchantRatingBadge({
  rating,
  totalReviews,
  size = "md",
  showReviewHint = false,
  variant = "inline",
  compact = false,
  cutout = false,
  onReviewHintPress,
}: Props) {
  const hasRating =
    rating != null && Number.isFinite(Number(rating)) && Number(rating) > 0;
  const ratingValue = hasRating ? Number(rating).toFixed(1) : null;
  const colors = ratingBadgeColors(hasRating ? Number(rating) : null);
  const isLowRating = colors.low;
  const onPillText = isLowRating ? "#713F12" : "#FFFFFF";
  const hasReviewCount = totalReviews != null && totalReviews > 0;

  const byLabel = useMemo(
    () => (hasReviewCount ? `By ${formatReviewCount(totalReviews!)}` : null),
    [hasReviewCount, totalReviews]
  );

  const showHintTrack =
    !compact && !!byLabel && (showReviewHint || variant === "overlay");
  const isXs = size === "xs";
  const isSm = size === "sm" || isXs;
  const isOverlay = variant === "overlay";
  const pillW = isSm ? PILL_W_SM : PILL_W_MD;
  const pillH = isSm ? PILL_H_SM : PILL_H_MD;
  const starSize = isSm ? 8 : 9;

  return (
    <View
      style={[
        showHintTrack ? (isOverlay ? styles.colOverlay : styles.col) : styles.colStatic,
        isOverlay ? styles.overlayWrap : undefined,
      ]}
    >
      <View
        style={[
          showHintTrack ? styles.togglePill : styles.pill,
          isSm && (showHintTrack ? styles.togglePillSm : styles.pillSm),
          isXs && !showHintTrack && styles.pillXs,
          showHintTrack
            ? { width: pillW, height: pillH, backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN }
            : { backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN },
          compact && styles.pillCompact,
          cutout && styles.pillCutout,
        ]}
      >
        {!showHintTrack && hasRating ? (
          <Ionicons name="star" size={isXs ? 9 : isSm ? 10 : 11} color={onPillText} />
        ) : null}
        <StoreText
          style={[
            showHintTrack ? styles.toggleRating : styles.text,
            isSm && styles.textSm,
            isXs && !showHintTrack && styles.textXs,
            { color: onPillText },
          ]}
          bold
          numberOfLines={1}
        >
          {ratingValue ?? "New"}
        </StoreText>
        {showHintTrack ? (
          <View
            style={[
              styles.starBubble,
              isSm && styles.starBubbleSm,
              {
                right: isSm ? 4 : 5,
                top: (pillH - (isSm ? 13 : STAR_BUBBLE)) / 2,
                borderColor: isLowRating ? "rgba(113,63,18,0.55)" : "rgba(255,255,255,0.9)",
              },
            ]}
          >
            <Ionicons name="star" size={starSize} color={onPillText} />
          </View>
        ) : null}
      </View>

      {showHintTrack ? (
        <Pressable
          onPress={onReviewHintPress}
          disabled={!onReviewHintPress}
          hitSlop={8}
          accessibilityRole={onReviewHintPress ? "button" : "text"}
          accessibilityLabel={`${byLabel}, learn how ratings are calculated`}
          style={({ pressed }) => [
            styles.hintPress,
            { width: pillW },
            pressed && onReviewHintPress ? styles.pressed : undefined,
          ]}
        >
          <StoreText style={styles.reviewHint} bold numberOfLines={1}>
            {byLabel}
          </StoreText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  colStatic: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  colOverlay: {
    alignItems: "flex-start",
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  togglePill: {
    borderRadius: 8,
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
  },
  togglePillSm: {
    borderRadius: 7,
  },
  toggleRating: {
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
  },
  starBubble: {
    position: "absolute",
    width: STAR_BUBBLE,
    height: STAR_BUBBLE,
    borderRadius: STAR_BUBBLE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  starBubbleSm: {
    width: 13,
    height: 13,
    borderRadius: 7,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 46,
  },
  pillSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    minWidth: 40,
  },
  pillXs: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 34,
    gap: 2,
  },
  pillCompact: {
    alignSelf: "flex-start",
  },
  pillCutout: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
    borderRadius: 8,
    zIndex: 1,
  },
  overlayWrap: {
    position: "absolute",
    bottom: 8,
    left: 8,
    zIndex: 4,
  },
  text: {
    fontSize: 12,
    color: "#fff",
  },
  textSm: {
    fontSize: 11,
  },
  textXs: {
    fontSize: 10,
  },
  hintPress: {
    marginTop: 10,
    alignSelf: "flex-end",
  },
  reviewHint: {
    height: HINT_TRACK_H,
    lineHeight: HINT_TRACK_H,
    fontSize: 10,
    color: "#9CA3AF",
    textAlign: "right",
    textDecorationLine: "underline",
  },
});
