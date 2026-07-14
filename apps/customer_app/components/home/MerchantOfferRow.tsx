/**
 * GatiMitra-style offer line under restaurant meta (blue % badge + copy).
 * Multiple offers → slide-up ticker (same pattern as Near & Fast).
 */

import React, { useEffect, useMemo } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { formatCardOfferLine } from "@/lib/merchantOfferBadge";
import { AppText } from "@/components/AppText";

const SWAP_MS = 2800;
const SLIDE_MS = 420;
const LINE_H = 18;

type Props = {
  /** Pipe-joined offer headlines (list card). */
  offerText?: string | null;
  /** Pre-split lines (inner store page). Same slide-up ticker as list card. */
  texts?: string[];
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

function parseOfferLines(offerText?: string | null, texts?: string[]): string[] {
  const fromTexts = (texts ?? []).map((t) => t.trim()).filter(Boolean);
  if (fromTexts.length > 0) {
    const lines: string[] = [];
    for (const part of fromTexts) {
      // Already-compact list/inner lines (incl. "GatiMitra · …") — keep as-is.
      if (
        (/GatiMitra\s*·/i.test(part) || /\d+\s*%|₹|buy\s+\d+/i.test(part)) &&
        part.length <= 48
      ) {
        if (!lines.includes(part)) lines.push(part);
        continue;
      }
      const formatted = formatCardOfferLine(part) ?? (/\d+\s*%|₹|buy\s+\d+/i.test(part) ? part : null);
      if (formatted && !lines.includes(formatted)) lines.push(formatted);
    }
    return lines;
  }
  const raw = offerText?.trim();
  if (!raw) return [];
  const parts = raw.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
  const lines: string[] = [];
  for (const part of parts) {
    if (/GatiMitra\s*·/i.test(part) && part.length <= 48) {
      if (!lines.includes(part)) lines.push(part);
      continue;
    }
    const formatted = formatCardOfferLine(part) ?? (/\d+\s*%|₹|buy\s+\d+/i.test(part) ? part : null);
    if (formatted && !lines.includes(formatted)) lines.push(formatted);
  }
  return lines;
}

export function MerchantOfferRow({ offerText, texts, compact = false, style }: Props) {
  const lines = useMemo(() => parseOfferLines(offerText, texts), [offerText, texts]);
  const shouldSwap = lines.length > 1;
  const slideIndex = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(slideIndex);
    slideIndex.value = 0;
    if (!shouldSwap) return;

    const n = lines.length;
    let phase = 0;

    const id = setInterval(() => {
      const next = phase + 1;
      if (next < n) {
        slideIndex.value = withTiming(next, {
          duration: SLIDE_MS,
          easing: Easing.inOut(Easing.cubic),
        });
        phase = next;
        return;
      }
      // Last → duplicate first at index n, then snap to 0 (seamless).
      slideIndex.value = withTiming(
        n,
        { duration: SLIDE_MS, easing: Easing.inOut(Easing.cubic) },
        (finished) => {
          if (finished) slideIndex.value = 0;
        }
      );
      phase = 0;
    }, SWAP_MS);

    return () => {
      clearInterval(id);
      cancelAnimation(slideIndex);
    };
  }, [shouldSwap, lines.length, slideIndex]);

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -slideIndex.value * LINE_H }],
  }));

  if (lines.length === 0) {
    return <View style={[styles.row, compact && styles.rowCompact, style]} />;
  }

  const renderLine = (text: string, key: string) => (
    <View key={key} style={styles.line}>
      <AppText style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );

  const tickerSlides = shouldSwap ? [...lines, lines[0]!] : lines;

  return (
    <View style={[styles.row, compact && styles.rowCompact, style]}>
      <View style={[styles.iconCircle, compact && styles.iconCircleCompact]}>
        <AppText style={[styles.iconSymbol, compact && styles.iconSymbolCompact]}>%</AppText>
      </View>
      {shouldSwap ? (
        <View style={styles.ticker}>
          <Animated.View style={[styles.slider, sliderStyle]}>
            {tickerSlides.map((t, i) => renderLine(t, `${t}-${i}`))}
          </Animated.View>
        </View>
      ) : (
        <AppText style={[styles.text, compact && styles.textCompact]} numberOfLines={1}>
          {lines[0]}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 0,
    height: LINE_H,
  },
  rowCompact: {
    marginTop: 0,
    gap: 7,
  },
  iconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconCircleCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  iconSymbol: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    lineHeight: 12,
  },
  iconSymbolCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  ticker: {
    flex: 1,
    height: LINE_H,
    overflow: "hidden",
    justifyContent: "flex-start",
  },
  slider: {
    alignItems: "flex-start",
    alignSelf: "stretch",
  },
  line: {
    height: LINE_H,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
    lineHeight: LINE_H,
  },
  textCompact: {
    fontSize: 12,
  },
});
