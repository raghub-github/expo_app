/**
 * GatiMitra grid rating — green pill + white ring straddling image bottom-left.
 * Page-colored mask notches the image corner (no floating white box).
 */

import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { ratingBadgeColors, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";

const PAGE_BG = GatiMitraColors.softBackground;

/** Shared geometry — mask + pill must use the same numbers. */
export const GRID_RATING_PILL = {
  left: 6,
  width: 42,
  overhang: 9,
  /** How far the notch bites into the image — keep low. */
  maskHeight: 7,
  topRightRadius: 7,
  borderWidth: 2,
  pillRadius: 7,
} as const;

type Props = {
  rating: number | null | undefined;
  totalReviews?: number | null;
  imageRadius?: number;
};

/** Erases bottom-left image corner so the pill looks embedded (page bg = seamless cut). */
export function GridCardImageRatingMask({ imageRadius = 14 }: { imageRadius?: number }) {
  const { left, width, maskHeight, topRightRadius } = GRID_RATING_PILL;
  const cornerSize = Math.min(8, imageRadius - 4);

  return (
    <View style={styles.maskLayer} pointerEvents="none">
      <View
        style={[
          styles.maskCorner,
          {
            width: cornerSize,
            height: cornerSize,
            borderTopRightRadius: cornerSize,
            backgroundColor: PAGE_BG,
          },
        ]}
      />
      <View
        style={[
          styles.maskBridge,
          { width: left, height: maskHeight, backgroundColor: PAGE_BG },
        ]}
      />
      <View
        style={[
          styles.maskShelf,
          {
            left,
            width: width + 4,
            height: maskHeight,
            borderTopRightRadius: topRightRadius,
            backgroundColor: PAGE_BG,
          },
        ]}
      />
    </View>
  );
}

export function GridCardRatingCutout({ rating, totalReviews }: Props) {
  const pillScale = useSharedValue(1);
  const pillSlide = useSharedValue(0);

  const hasRating = rating != null && Number(rating) >= 0;
  const ratingValue = hasRating ? Number(rating).toFixed(1) : "New";
  const colors = ratingBadgeColors(hasRating ? Number(rating) : null);
  const onPillText = colors.low ? "#713F12" : "#FFFFFF";
  const canTap = totalReviews != null && totalReviews > 0;

  const handlePress = () => {
    if (!canTap) return;
    pillSlide.value = withSequence(
      withTiming(7, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(0, { damping: 14, stiffness: 280 })
    );
    pillScale.value = withSequence(
      withTiming(0.92, { duration: 90 }),
      withSpring(1, { damping: 13, stiffness: 340 })
    );
  };

  const pillAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: pillSlide.value }, { scale: pillScale.value }],
  }));

  const { left, overhang, borderWidth, pillRadius } = GRID_RATING_PILL;

  return (
    <View style={[styles.pillWrap, { bottom: -overhang, left }]}>
      <Pressable onPress={handlePress} disabled={!canTap} hitSlop={8}>
        <Animated.View
          style={[
            styles.pill,
            {
              backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN,
              borderRadius: pillRadius,
              borderWidth,
            },
            pillAnim,
          ]}
        >
          {hasRating ? <Ionicons name="star" size={9} color={onPillText} /> : null}
          <Text style={[styles.pillText, { color: onPillText }]}>{ratingValue}</Text>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  maskLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  maskCorner: {
    position: "absolute",
    left: 0,
    bottom: 0,
  },
  maskBridge: {
    position: "absolute",
    left: 0,
    bottom: 0,
  },
  maskShelf: {
    position: "absolute",
    bottom: 0,
  },
  pillWrap: {
    position: "absolute",
    zIndex: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderColor: "#FFFFFF",
    minWidth: 40,
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
