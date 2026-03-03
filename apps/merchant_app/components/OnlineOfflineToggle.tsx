/**
 * Store status toggle — reference style: compact, green/red, text left, white rounded-square slider right.
 * "ONLINE" / "OFFLINE", decreased width.
 */

import { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Platform } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";

const PILL_HEIGHT = 30;
const KNOB_SIZE = 22;
const KNOB_RADIUS = 6;
const PILL_PADDING = 6;
const PILL_WIDTH = 92;
const KNOB_TRAVEL = PILL_WIDTH - PILL_PADDING * 2 - KNOB_SIZE;

const ONLINE_GREEN = "#22C55E";
const OFFLINE_RED = "#EF4444";

export function OnlineOfflineToggle({
  isOnline,
  onToggle,
}: {
  isOnline: boolean;
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

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        styles.pillWrap,
        pressed && styles.pillPressed,
        GatiMitraMerchant.cursorPointer,
      ]}
    >
      <Animated.View style={[styles.pill, { backgroundColor }]}>
        <View style={styles.labelLeft} pointerEvents="none">
          <Text style={styles.label} numberOfLines={1}>
            {isOnline ? "ONLINE" : ""}
          </Text>
        </View>
        <View style={styles.labelRight} pointerEvents="none">
          <Text style={styles.label} numberOfLines={1}>
            {!isOnline ? "OFFLINE" : ""}
          </Text>
        </View>
        <Animated.View
          style={[styles.knob, { transform: [{ translateX: knobTranslateX }] }]}
        />
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
    width: PILL_WIDTH,
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
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  knob: {
    position: "absolute",
    left: PILL_PADDING,
    width: KNOB_SIZE,
    height: KNOB_SIZE,
    borderRadius: KNOB_RADIUS,
    backgroundColor: "#FFFFFF",
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
});
