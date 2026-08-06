/**
 * GatiMitra / Zomato-style rating pill — capsule with ★ bubble + rating;
 * optional hint under pill ("For you" / "By X+"), clickable toggle.
 */

import { memo, useMemo } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ratingBadgeColors, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";
import { StoreText } from "@/components/store/StoreText";

type Props = {
  rating: number | null | undefined;
  totalReviews?: number | null;
  size?: "xs" | "sm" | "md";
  showReviewHint?: boolean;
  /** Override hint under pill (e.g. "For you"). */
  hintLabel?: string | null;
  /** Force pill to show "New" (no star). */
  showAsNew?: boolean;
  variant?: "overlay" | "inline";
  compact?: boolean;
  cutout?: boolean;
  /** Pill tap — toggle rating mode only (no sheet). */
  onPillPress?: () => void;
  /** Hint text tap — open explainer sheet. */
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

function MerchantRatingBadgeInner({
  rating,
  totalReviews,
  size = "md",
  showReviewHint = false,
  hintLabel,
  showAsNew = false,
  variant = "inline",
  compact = false,
  cutout = false,
  onPillPress,
  onReviewHintPress,
}: Props) {
  const hasNumeric =
    !showAsNew && rating != null && Number.isFinite(Number(rating)) && Number(rating) > 0;
  const ratingValue = hasNumeric ? Number(rating).toFixed(1) : null;
  const colors = ratingBadgeColors(hasNumeric ? Number(rating) : null);
  const isLowRating = colors.low;
  const onPillText = isLowRating ? "#713F12" : "#FFFFFF";
  const hasReviewCount = totalReviews != null && totalReviews > 0;

  const resolvedHint = useMemo(() => {
    if (hintLabel != null) return hintLabel.trim() || null;
    if (hasReviewCount) return `By ${formatReviewCount(totalReviews!)}`;
    return null;
  }, [hintLabel, hasReviewCount, totalReviews]);

  const showHintTrack =
    !compact && (showReviewHint || variant === "overlay") && resolvedHint != null;
  const useListPill = !compact && (showReviewHint || variant === "overlay");
  const isXs = size === "xs";
  const isSm = size === "sm" || isXs;
  const isOverlay = variant === "overlay";
  const pillW = isSm ? PILL_W_SM : PILL_W_MD;
  const pillH = isSm ? PILL_H_SM : PILL_H_MD;
  const starSize = isSm ? 8 : 9;
  const canPressPill = Boolean(onPillPress);
  const canPressHint = Boolean(onReviewHintPress);
  const pillBg = hasNumeric ? colors.bg : RATING_PILL_GREEN;
  const displayText = showAsNew || !hasNumeric ? "New" : ratingValue!;

  const pillInner = (
    <View
      style={[
        useListPill ? styles.listPill : styles.pill,
        isSm && (useListPill ? styles.listPillSm : styles.pillSm),
        isXs && !useListPill && styles.pillXs,
        useListPill
          ? { width: pillW, height: pillH, backgroundColor: pillBg }
          : { backgroundColor: pillBg },
        compact && styles.pillCompact,
        cutout && styles.pillCutout,
      ]}
    >
      {!useListPill && hasNumeric ? (
        <Ionicons name="star" size={isXs ? 9 : isSm ? 10 : 11} color={onPillText} />
      ) : null}
      <StoreText
        style={[
          useListPill ? styles.listRating : styles.text,
          isSm && styles.textSm,
          isXs && !useListPill && styles.textXs,
          { color: onPillText },
          (showAsNew || !hasNumeric) && useListPill ? styles.listRatingNew : null,
        ]}
        bold
        numberOfLines={1}
      >
        {displayText}
      </StoreText>
      {useListPill && hasNumeric ? (
        <View
          style={[
            styles.starBubble,
            isSm && styles.starBubbleSm,
            {
              right: isSm ? 4 : 5,
              top: (pillH - (isSm ? 13 : STAR_BUBBLE)) / 2,
            },
          ]}
        >
          <Ionicons name="star" size={starSize} color={pillBg} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        showHintTrack || useListPill
          ? isOverlay
            ? styles.colOverlay
            : styles.col
          : styles.colStatic,
        isOverlay ? styles.overlayWrap : undefined,
      ]}
    >
      {canPressPill ? (
        <Pressable
          onPress={onPillPress}
          hitSlop={{ top: 6, left: 6, right: 6, bottom: 2 }}
          accessibilityRole="button"
          accessibilityLabel={`Rating ${displayText}${resolvedHint ? `, ${resolvedHint}` : ""}`}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}
        >
          {pillInner}
        </Pressable>
      ) : (
        pillInner
      )}

      {showHintTrack ? (
        <Pressable
          onPress={onReviewHintPress}
          disabled={!canPressHint}
          hitSlop={{ top: 2, bottom: 8, left: 8, right: 8 }}
          accessibilityRole={canPressHint ? "button" : "text"}
          accessibilityLabel={resolvedHint ?? undefined}
          style={({ pressed }) => [
            styles.hintPress,
            { width: pillW },
            pressed && canPressHint ? styles.pressed : undefined,
          ]}
        >
          <StoreText style={styles.reviewHint} numberOfLines={1}>
            {resolvedHint}
          </StoreText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    alignItems: "center",
    flexShrink: 0,
  },
  colStatic: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  colOverlay: {
    alignItems: "center",
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.72,
  },
  listPill: {
    borderRadius: 999,
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
  },
  listPillSm: {
    borderRadius: 999,
  },
  listRating: {
    fontSize: 12,
    color: "#fff",
    textAlign: "center",
    paddingRight: 14,
  },
  listRatingNew: {
    paddingRight: 0,
    paddingHorizontal: 4,
  },
  starBubble: {
    position: "absolute",
    width: STAR_BUBBLE,
    height: STAR_BUBBLE,
    borderRadius: STAR_BUBBLE / 2,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 999,
    minWidth: 46,
    overflow: "hidden",
  },
  pillSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    minWidth: 40,
  },
  pillXs: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 34,
    gap: 2,
  },
  pillCompact: {
    alignSelf: "flex-start",
  },
  pillCutout: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
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
    marginTop: 6,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewHint: {
    height: HINT_TRACK_H,
    lineHeight: HINT_TRACK_H,
    fontSize: 11,
    fontWeight: "400",
    color: "#9CA3AF",
    textAlign: "center",
    width: "100%",
  },
});

/**
 * Rendered once per list item. Memoised so a parent re-render (a filter
 * toggle, a store-status tick, a bill recalculation) does not walk every
 * mounted instance.
 */
export const MerchantRatingBadge = memo(MerchantRatingBadgeInner);
