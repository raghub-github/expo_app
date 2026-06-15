/**
 * Animated "Near & Fast" + delivery time + distance row (GatiMitra-style).
 */

import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

function formatDistance(km?: number): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export type NearFastDeliveryMetaProps = {
  deliveryTime?: string | null;
  distanceKm?: number | null;
  /** Highlight "Near & Fast" when within this km (default 3). */
  nearThresholdKm?: number;
  compact?: boolean;
  /** Light text for dark header overlays. */
  onDark?: boolean;
};

export function NearFastDeliveryMeta({
  deliveryTime,
  distanceKm,
  nearThresholdKm = 3,
  compact = false,
  onDark = false,
}: NearFastDeliveryMetaProps) {
  const pulse = useSharedValue(1);
  const distanceStr = formatDistance(distanceKm ?? undefined);
  const isNear = distanceKm != null && distanceKm <= nearThresholdKm;
  const hasTime = Boolean(deliveryTime?.trim());
  const hasDistance = Boolean(distanceStr);

  useEffect(() => {
    if (!isNear) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(withTiming(1.2, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
      false
    );
  }, [isNear, pulse]);

  const flashStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (!isNear && !hasTime && !hasDistance) return null;

  return (
    <Animated.View entering={FadeIn.duration(400)} style={styles.row}>
      {isNear ? (
        <View style={styles.nearWrap}>
          <Animated.View style={flashStyle}>
            <Ionicons name="flash" size={compact ? 13 : 14} color="#16a34a" />
          </Animated.View>
          <Text
            style={[
              styles.nearText,
              compact && styles.nearTextCompact,
              onDark && styles.nearTextOnDark,
            ]}
          >
            Near & Fast
          </Text>
        </View>
      ) : null}
      {hasTime || hasDistance ? (
        <Animated.Text
          entering={FadeIn.delay(120).duration(350)}
          style={[styles.meta, compact && styles.metaCompact, onDark && styles.metaOnDark]}
          numberOfLines={1}
        >
          {isNear && (hasTime || hasDistance) ? " · " : ""}
          {hasTime ? deliveryTime : ""}
          {hasTime && hasDistance ? " | " : ""}
          {hasDistance ? distanceStr : ""}
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 6,
    gap: 2,
  },
  nearWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
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
    fontWeight: "500",
  },
  metaCompact: {
    fontSize: 12,
  },
  metaOnDark: {
    color: "rgba(255,255,255,0.92)",
  },
});
