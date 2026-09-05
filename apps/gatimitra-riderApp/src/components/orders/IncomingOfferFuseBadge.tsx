import React, { memo, useEffect, useMemo, useState } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/theme";
import {
  riderAcceptSecondsLeft,
  riderAcceptTimeProgress,
} from "@/src/lib/riderOrderAcceptWindow";

const BADGE_W = 168;
const BADGE_H = 42;
const BADGE_STROKE = 4;
const URGENT_SECONDS = 20;

type OfferClockOrder = {
  id: string;
  acceptDeadlineAt?: string;
  offerShownAtMs?: number;
  createdAt: string;
};

function buildPillOutlinePath(w: number, h: number, inset: number): string {
  const x = inset;
  const y = inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const r = ih / 2;
  if (iw < ih) return "";
  const topCx = x + iw / 2;
  return [
    `M ${topCx} ${y}`,
    `L ${x + iw - r} ${y}`,
    `A ${r} ${r} 0 0 1 ${x + iw} ${y + r}`,
    `V ${y + ih - r}`,
    `A ${r} ${r} 0 0 1 ${x + iw - r} ${y + ih}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + ih - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    `H ${topCx}`,
    "Z",
  ].join(" ");
}

function pillOutlineLength(w: number, h: number, inset: number): number {
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  if (iw < ih) return 0;
  return 2 * (iw - ih) + Math.PI * ih;
}

/**
 * Fuse badge with its own clock — does not re-render the offer body.
 */
export const IncomingOfferFuseBadge = memo(function IncomingOfferFuseBadge({
  order,
  visible,
  label,
}: {
  order: OfferClockOrder;
  visible: boolean;
  label: string;
}) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [visible]);

  const secondsLeft = useMemo(() => riderAcceptSecondsLeft(order), [order, nowTick]);
  const borderProgress = useMemo(() => riderAcceptTimeProgress(order), [order, nowTick]);
  const urgent = secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

  const pulse = useSharedValue(1);
  const entryScale = useSharedValue(0.94);

  useEffect(() => {
    entryScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    const pulseTo = urgent ? 1.04 : 1.02;
    const pulseMs = urgent ? 420 : 850;
    pulse.value = withRepeat(
      withSequence(
        withTiming(pulseTo, { duration: pulseMs, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: pulseMs, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [entryScale, pulse, urgent]);

  const shellStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entryScale.value * pulse.value }],
  }));

  const progress = Math.max(0, Math.min(1, borderProgress));
  const borderColor = urgent ? colors.error[600] : colors.success[700];
  const trackColor = urgent ? "rgba(220, 38, 38, 0.28)" : "rgba(21, 128, 61, 0.24)";
  const inset = BADGE_STROKE / 2;
  const pathD = buildPillOutlinePath(BADGE_W, BADGE_H, inset);
  const pathLen = pillOutlineLength(BADGE_W, BADGE_H, inset);
  const dashOffset = (1 - progress) * pathLen;

  return (
    <Animated.View style={[styles.badgeFuseShell, shellStyle]}>
      <Svg width={BADGE_W} height={BADGE_H} style={styles.badgeFuseSvg}>
        <Path d={pathD} stroke={trackColor} strokeWidth={BADGE_STROKE} fill="#FFFFFF" />
        {progress > 0.005 ? (
          <Path
            d={pathD}
            stroke={borderColor}
            strokeWidth={BADGE_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${pathLen} ${pathLen}`}
            strokeDashoffset={dashOffset}
          />
        ) : null}
      </Svg>
      <View style={styles.newOrderBadgePill} pointerEvents="none">
        <Text style={[styles.newOrderBadgeText, urgent && styles.newOrderBadgeTextUrgent]}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  badgeFuseShell: {
    width: BADGE_W,
    height: BADGE_H,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeFuseSvg: {
    position: "absolute",
  },
  newOrderBadgePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  newOrderBadgeText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.success[800],
    letterSpacing: 0.2,
  },
  newOrderBadgeTextUrgent: {
    color: colors.error[700],
  },
});
