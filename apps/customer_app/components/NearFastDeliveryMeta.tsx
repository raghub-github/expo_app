/**
 * Delivery meta — within 5 km: slide-up ticker "Near & Fast" ↔ time | distance.
 * Beyond 5 km: static time | distance only (no Near & Fast, no animation).
 */

import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useCardAnimationsEnabled } from "@/hooks/useCardAnimationsEnabled";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppText } from "@/components/AppText";

const SWAP_MS = 2800;
const SLIDE_MS = 420;
const LINE_H = 18;

function formatDistance(km?: number): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export type NearFastDeliveryMetaProps = {
  deliveryTime?: string | null;
  distanceKm?: number | null;
  nearThresholdKm?: number;
  compact?: boolean;
  onDark?: boolean;
  freeDelivery?: boolean;
};

function MetaDivider({ color }: { color: string }) {
  return <View style={[styles.divider, { backgroundColor: color }]} />;
}

function NearFastDeliveryMetaInner({
  deliveryTime,
  distanceKm,
  nearThresholdKm = 5,
  compact = false,
  onDark = false,
  freeDelivery = false,
}: NearFastDeliveryMetaProps) {
  const distanceStr = formatDistance(distanceKm ?? undefined);
  const isNear = distanceKm != null && distanceKm <= nearThresholdKm;
  const hasTime = Boolean(deliveryTime?.trim());
  const hasDistance = Boolean(distanceStr);
  const showFree = freeDelivery === true;
  const hasEtaRow = hasTime || hasDistance || showFree;
  // Drives LAYOUT — must stay independent of motion so the row does not collapse
  // to a single line whenever the list is scrolled.
  const shouldSwap = isNear && hasEtaRow;
  // Drives only the timer: one per merchant card, suspended while the app is
  // backgrounded or a scroll is in flight. See useCardAnimationsEnabled.
  const motionAllowed = useCardAnimationsEnabled();
  const animateSwap = shouldSwap && motionAllowed;

  /**
   * Seamless ticker: [near, eta, near] — slide 0→1→2, then snap 2→0 (identical frame).
   * No React state swap mid-animation → no flicker.
   */
  const slideIndex = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(slideIndex);
    slideIndex.value = 0;
    if (!animateSwap) return;

    /** 0 = resting on Near & Fast, 1 = resting on ETA */
    let phase: 0 | 1 = 0;

    const id = setInterval(() => {
      if (phase === 0) {
        slideIndex.value = withTiming(1, {
          duration: SLIDE_MS,
          easing: Easing.inOut(Easing.cubic),
        });
        phase = 1;
        return;
      }

      // ETA → Near (duplicate at index 2), then instant snap to 0 (same pixels).
      slideIndex.value = withTiming(
        2,
        { duration: SLIDE_MS, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) {
            slideIndex.value = 0;
          }
        }
      );
      phase = 0;
    }, SWAP_MS);

    return () => {
      clearInterval(id);
      cancelAnimation(slideIndex);
    };
  }, [animateSwap, slideIndex]);

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -slideIndex.value * LINE_H }],
  }));

  const iconSize = compact ? 13 : 14;
  const nearColor = onDark ? "#bbf7d0" : "#16a34a";
  const muted = onDark ? "rgba(255,255,255,0.92)" : "#4B5563";
  const etaColor = isNear ? nearColor : muted;
  const dividerColor = isNear
    ? onDark
      ? "rgba(187,247,208,0.45)"
      : "rgba(22,163,74,0.35)"
    : onDark
      ? "rgba(255,255,255,0.35)"
      : "#D1D5DB";

  if (!isNear && !hasEtaRow) {
    return <View style={styles.wrap} />;
  }

  const etaRow = (
    <View style={[styles.row, styles.line]}>
      {isNear ? <Ionicons name="flash" size={iconSize} color={etaColor} /> : null}
      {hasTime ? (
        <View style={styles.seg}>
          {!isNear ? <Ionicons name="time-outline" size={iconSize} color={muted} /> : null}
          <AppText
            style={[
              styles.meta,
              compact && styles.metaCompact,
              { color: etaColor },
              isNear && styles.metaNear,
            ]}
            numberOfLines={1}
          >
            {deliveryTime}
          </AppText>
        </View>
      ) : null}
      {hasTime && hasDistance ? <MetaDivider color={dividerColor} /> : null}
      {hasDistance ? (
        <View style={styles.seg}>
          <AppText
            style={[
              styles.meta,
              compact && styles.metaCompact,
              { color: etaColor },
              isNear && styles.metaNear,
            ]}
            numberOfLines={1}
          >
            {distanceStr}
          </AppText>
        </View>
      ) : null}
      {showFree ? (
        <>
          {hasTime || hasDistance ? <MetaDivider color={dividerColor} /> : null}
          <View style={styles.seg}>
            <Ionicons name="bicycle-outline" size={iconSize} color={etaColor} />
            <AppText
              style={[
                styles.meta,
                compact && styles.metaCompact,
                { color: etaColor },
                isNear && styles.metaNear,
              ]}
              numberOfLines={1}
            >
              Free
            </AppText>
          </View>
        </>
      ) : null}
    </View>
  );

  const nearRow = (
    <View style={[styles.row, styles.line]}>
      <Ionicons name="flash" size={iconSize} color={nearColor} />
      <AppText
        style={[
          styles.nearText,
          compact && styles.nearTextCompact,
          onDark && styles.nearTextOnDark,
        ]}
      >
        Near & Fast
      </AppText>
    </View>
  );

  let body: React.ReactNode;
  if (shouldSwap) {
    body = (
      <View style={styles.ticker}>
        <Animated.View style={[styles.slider, sliderStyle]}>
          {nearRow}
          {etaRow}
          {nearRow}
        </Animated.View>
      </View>
    );
  } else if (isNear) {
    body = nearRow;
  } else {
    body = etaRow;
  }

  return <View style={styles.wrap}>{body}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 0,
    height: LINE_H,
    width: "100%",
    alignItems: "flex-start",
    justifyContent: "center",
    overflow: "hidden",
  },
  ticker: {
    height: LINE_H,
    width: "100%",
    alignItems: "flex-start",
    overflow: "hidden",
  },
  slider: {
    alignItems: "flex-start",
    alignSelf: "flex-start",
  },
  line: {
    height: LINE_H,
    alignSelf: "flex-start",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    alignSelf: "flex-start",
    flexWrap: "nowrap",
    gap: 4,
  },
  seg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    marginHorizontal: 4,
  },
  nearText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#16a34a",
  },
  nearTextCompact: {
    fontSize: 12,
  },
  nearTextOnDark: {
    color: "#bbf7d0",
  },
  meta: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    fontWeight: "600",
  },
  metaCompact: {
    fontSize: 12,
  },
  metaNear: {
    fontWeight: "700",
  },
});

/**
 * Rendered once per list item. Memoised so a parent re-render (a filter
 * toggle, a store-status tick, a bill recalculation) does not walk every
 * mounted instance.
 */
export const NearFastDeliveryMeta = React.memo(NearFastDeliveryMetaInner);
