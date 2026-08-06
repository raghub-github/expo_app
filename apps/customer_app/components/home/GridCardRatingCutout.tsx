/**
 * Swiggy-style rating cutout:
 * - White pad flush left, rounded right (wraps the pill)
 * - Green pill: full capsule (rounded both ends)
 * Decorative only — pointerEvents none so card taps aren't stolen.
 */

import { memo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { ratingBadgeColors, RATING_PILL_GREEN } from "@/lib/merchantOfferBadge";
import { AppText } from "@/components/AppText";

const PAGE_BG = GatiMitraColors.softBackground;

export const GRID_RATING_PILL = {
  left: 0,
  padW: 44,
  padH: 24,
  overhang: 5,
  /** White padding around green pill. */
  pillInset: 3,
} as const;

type Props = {
  rating: number | null | undefined;
  totalReviews?: number | null;
  imageRadius?: number;
  pageBg?: string;
};

/**
 * White pad: square left edge, full semicircle on the right
 * so the banner image curves around the rating (Swiggy match).
 */
function RatingCutoutPad({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  const r = height / 2;
  const d = [
    `M 0 0`,
    `L ${width - r} 0`,
    `A ${r} ${r} 0 0 1 ${width - r} ${height}`,
    `L 0 ${height}`,
    `Z`,
  ].join(" ");

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Path d={d} fill={color} />
    </Svg>
  );
}

/** @deprecated */
export function GridCardImageRatingMask(_props?: {
  imageRadius?: number;
  pageBg?: string;
}) {
  return null;
}

function GridCardRatingCutoutInner({
  rating,
  pageBg = PAGE_BG,
}: Props) {
  const hasRating = rating != null && Number(rating) >= 0;
  const ratingValue = hasRating ? Number(rating).toFixed(1) : "New";
  const colors = ratingBadgeColors(hasRating ? Number(rating) : null);
  const onPillText = colors.low ? "#713F12" : "#FFFFFF";

  const { left, padW, padH, overhang, pillInset } = GRID_RATING_PILL;

  return (
    <View
      style={[
        styles.cutoutWrap,
        {
          left,
          bottom: -overhang,
          width: padW,
          height: padH,
        },
      ]}
      pointerEvents="none"
    >
      <RatingCutoutPad width={padW} height={padH} color={pageBg} />

      <View
        style={[
          styles.pillHit,
          {
            top: pillInset,
            left: pillInset,
            right: pillInset,
            bottom: pillInset,
          },
        ]}
      >
        <View
          style={[
            styles.pill,
            {
              backgroundColor: hasRating ? colors.bg : RATING_PILL_GREEN,
            },
          ]}
        >
          {hasRating ? <Ionicons name="star" size={8} color={onPillText} /> : null}
          <AppText style={[styles.pillText, { color: onPillText }]}>{ratingValue}</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cutoutWrap: {
    position: "absolute",
    zIndex: 6,
  },
  pillHit: {
    position: "absolute",
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 7,
    overflow: "hidden",
    borderRadius: 999,
  },
  pillText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

/**
 * Rendered once per list item. Memoised so a parent re-render (a filter
 * toggle, a store-status tick, a bill recalculation) does not walk every
 * mounted instance.
 */
export const GridCardRatingCutout = memo(GridCardRatingCutoutInner);
