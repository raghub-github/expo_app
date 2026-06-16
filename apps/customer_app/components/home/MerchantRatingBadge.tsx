/**
 * Zomato-style rating pill — tap toggles star left (By X+) ↔ right (For you).
 */

import { useMemo, useState } from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { ratingBadgeColors, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";

type Props = {
  rating: number | null | undefined;
  totalReviews?: number | null;
  size?: "xs" | "sm" | "md";
  showReviewHint?: boolean;
  variant?: "overlay" | "inline";
  compact?: boolean;
  cutout?: boolean;
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
}: Props) {
  const [forYou, setForYou] = useState(false);
  const toggleProgress = useSharedValue(0);
  const hintProgress = useSharedValue(0);

  const hasRating = rating != null && Number(rating) >= 0;
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
  const useTogglePill = showHintTrack;
  const canInteract = !!byLabel && (showHintTrack || compact);
  const isXs = size === "xs";
  const isSm = size === "sm" || isXs;
  const isOverlay = variant === "overlay";
  const pillW = isSm ? PILL_W_SM : PILL_W_MD;
  const pillH = isSm ? PILL_H_SM : PILL_H_MD;
  const starSize = isSm ? 8 : 9;
  const starTravel = pillW - STAR_BUBBLE - (isSm ? 8 : 10);

  const onPress = () => {
    if (!canInteract) return;

    const next = !forYou;
    setForYou(next);

    if (useTogglePill) {
      toggleProgress.value = withTiming(next ? 1 : 0, {
        duration: 260,
        easing: Easing.inOut(Easing.cubic),
      });
      hintProgress.value = withTiming(next ? 1 : 0, {
        duration: 260,
        easing: Easing.inOut(Easing.cubic),
      });
    }
  };

  const starSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 4 + toggleProgress.value * starTravel }],
  }));

  const ratingShiftStyle = useAnimatedStyle(() => ({
    paddingLeft: (1 - toggleProgress.value) * (STAR_BUBBLE + 5),
    paddingRight: toggleProgress.value * (STAR_BUBBLE + 5),
  }));

  const hintSliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -hintProgress.value * HINT_TRACK_H }],
  }));

  const byHintStyle = useAnimatedStyle(() => ({
    opacity: 1 - hintProgress.value * 0.4,
  }));

  const forYouHintStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + hintProgress.value * 0.5,
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={!canInteract}
      hitSlop={8}
      accessibilityRole={canInteract ? "button" : "text"}
      accessibilityState={{ selected: forYou }}
      accessibilityLabel={
        forYou
          ? `Rating ${ratingValue ?? "new"}, for you`
          : `Rating ${ratingValue ?? "new"}${byLabel ? `, ${byLabel}` : ""}`
      }
      style={({ pressed }) => [
        showHintTrack ? (isOverlay ? styles.colOverlay : styles.col) : styles.colStatic,
        isOverlay ? styles.overlayWrap : undefined,
        pressed && canInteract ? styles.pressed : undefined,
      ]}
    >
      {useTogglePill ? (
        <View
          style={[
            styles.togglePill,
            isSm && styles.togglePillSm,
            { width: pillW, height: pillH, backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN },
          ]}
        >
          <Animated.Text
            style={[
              styles.toggleRating,
              isSm && styles.textSm,
              ratingShiftStyle,
              { color: onPillText },
            ]}
            numberOfLines={1}
          >
            {ratingValue ?? "New"}
          </Animated.Text>
          <Animated.View
            style={[
              styles.starBubble,
              isSm && styles.starBubbleSm,
              starSlideStyle,
              {
                top: (pillH - (isSm ? 13 : STAR_BUBBLE)) / 2,
                borderColor: isLowRating ? "rgba(113,63,18,0.55)" : "rgba(255,255,255,0.9)",
              },
            ]}
          >
            <Ionicons name="star" size={starSize} color={onPillText} />
          </Animated.View>
        </View>
      ) : (
        <View
          style={[
            styles.pill,
            isSm && styles.pillSm,
            isXs && styles.pillXs,
            { backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN },
            compact && styles.pillCompact,
            cutout && styles.pillCutout,
          ]}
        >
          {hasRating ? (
            <Ionicons name="star" size={isXs ? 9 : isSm ? 10 : 11} color={onPillText} />
          ) : null}
          <Text
            style={[
              styles.text,
              isSm && styles.textSm,
              isXs && styles.textXs,
              { color: onPillText },
            ]}
          >
            {ratingValue ?? "New"}
          </Text>
        </View>
      )}

      {showHintTrack ? (
        <View style={[styles.hintClip, { width: pillW }]}>
          <Animated.View style={hintSliderStyle}>
            <Animated.Text
              style={[styles.reviewHint, byHintStyle]}
              numberOfLines={1}
            >
              {byLabel}
            </Animated.Text>
            <Animated.Text
              style={[styles.reviewHint, styles.reviewHintForYou, forYouHintStyle]}
              numberOfLines={1}
            >
              For you
            </Animated.Text>
          </Animated.View>
        </View>
      ) : null}
    </Pressable>
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
    opacity: 0.92,
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
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
  starBubble: {
    position: "absolute",
    left: 0,
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
    fontWeight: "700",
    color: "#fff",
  },
  textSm: {
    fontSize: 11,
  },
  textXs: {
    fontSize: 10,
  },
  hintClip: {
    height: HINT_TRACK_H,
    overflow: "hidden",
    marginTop: 3,
    alignSelf: "flex-end",
  },
  reviewHint: {
    height: HINT_TRACK_H,
    lineHeight: HINT_TRACK_H,
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
    textAlign: "right",
  },
  reviewHintForYou: {
    color: "#16A34A",
    fontWeight: "600",
  },
});
