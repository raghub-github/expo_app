/**
 * Store status toggle — reference style: compact, green/red, text left, white rounded-square slider right.
 * "ONLINE" / "OFFLINE", decreased width.
 */

import { useEffect, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, Pressable, StyleSheet, Animated, Platform } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";
import { RadarLiveIndicator } from "@/components/RadarLiveIndicator";

const PILL_HEIGHT = 34;
const KNOB_SIZE = 24;
const KNOB_RADIUS = 7;
const PILL_PADDING = 6;
const PILL_WIDTH = 104;
const DELISTED_PILL_WIDTH = 124;
const KNOB_TRAVEL = PILL_WIDTH - PILL_PADDING * 2 - KNOB_SIZE;

const ONLINE_GREEN = "#16A34A";
const OFFLINE_RED = "#DC2626";

export function OnlineOfflineToggle({
  isOnline,
  isDelisted = false,
  onToggle,
}: {
  isOnline: boolean;
  isDelisted?: boolean;
  onToggle: () => void;
}) {
  const animValue = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(animValue, {
      toValue: isOnline ? 1 : 0,
      useNativeDriver: false,
      speed: 18,
      bounciness: 0,
    }).start();
  }, [isOnline, animValue]);

  const backgroundColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [OFFLINE_RED, ONLINE_GREEN],
  });

  const knobTranslateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, KNOB_TRAVEL],
  });

  const pillWidth = isDelisted ? DELISTED_PILL_WIDTH : PILL_WIDTH;
  const labelSlotWidth = pillWidth - PILL_PADDING * 2 - KNOB_SIZE - 4;

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.pillWrap,
        pressed && styles.pillPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <Animated.View style={[styles.pill, { width: pillWidth, backgroundColor }]}>
        <View style={[styles.labelLeft, { width: labelSlotWidth }]} pointerEvents="none">
          <Text style={styles.label} numberOfLines={1}>
            {isOnline ? "ONLINE" : ""}
          </Text>
        </View>
        <View style={[styles.labelRight, { width: labelSlotWidth }]} pointerEvents="none">
          <Text style={[styles.label, isDelisted && styles.labelDelisted]} numberOfLines={1}>
            {!isOnline ? (isDelisted ? "DELISTED" : "OFFLINE") : ""}
          </Text>
        </View>
        <Animated.View
          style={[styles.knob, { transform: [{ translateX: knobTranslateX }] }]}
        >
          {isOnline ? (
            <RadarLiveIndicator compact />
          ) : (
            <View style={styles.offlineKnobDot} />
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillWrap: {
    borderRadius: 8,
    overflow: "hidden",
  },
  pillPressed: {
    opacity: 0.9,
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PILL_PADDING,
    position: "relative",
  },
  labelLeft: {
    position: "absolute",
    left: PILL_PADDING,
    width: PILL_WIDTH - PILL_PADDING * 2 - KNOB_SIZE - 4,
    justifyContent: "center",
    height: PILL_HEIGHT,
    zIndex: 1,
  },
  labelRight: {
    position: "absolute",
    right: PILL_PADDING,
    width: PILL_WIDTH - PILL_PADDING * 2 - KNOB_SIZE - 4,
    alignItems: "flex-end",
    justifyContent: "center",
    height: PILL_HEIGHT,
    zIndex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  labelDelisted: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
  knob: {
    position: "absolute",
    left: PILL_PADDING,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_RADIUS,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  offlineKnobDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: OFFLINE_RED,
  },
});
