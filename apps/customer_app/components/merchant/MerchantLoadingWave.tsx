/**
 * Soft gray/white wave strip above the merchant loading sentence.
 */

import React, { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const WAVE_H = 36;
/** Soft gray layers — matches skeleton, no green. */
const WAVE_BACK = "rgba(148, 163, 184, 0.22)";
const WAVE_FRONT = "rgba(226, 232, 240, 0.95)";

function wavePath(w: number, amp: number, yBase: number): string {
  const mid = yBase;
  return [
    `M 0 ${mid}`,
    `Q ${w * 0.25} ${mid - amp} ${w * 0.5} ${mid}`,
    `Q ${w * 0.75} ${mid + amp} ${w} ${mid}`,
    `L ${w} ${WAVE_H}`,
    `L 0 ${WAVE_H}`,
    "Z",
  ].join(" ");
}

export function MerchantLoadingWave() {
  const { width } = useWindowDimensions();
  const tileW = Math.ceil(width) + 2;
  const shift = useSharedValue(0);

  useEffect(() => {
    shift.value = 0;
    shift.value = withRepeat(
      withTiming(-tileW, { duration: 3200, easing: Easing.linear }),
      -1,
      false
    );
  }, [shift, tileW]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }],
  }));

  return (
    <View style={styles.wrap} pointerEvents="none">
      <Animated.View style={[styles.track, { width: tileW * 2 }, animStyle]}>
        <Svg width={tileW} height={WAVE_H} style={styles.tile}>
          <Path d={wavePath(tileW, 8, 18)} fill={WAVE_BACK} />
          <Path d={wavePath(tileW, 5, 22)} fill={WAVE_FRONT} />
        </Svg>
        <Svg width={tileW} height={WAVE_H} style={styles.tile}>
          <Path d={wavePath(tileW, 8, 18)} fill={WAVE_BACK} />
          <Path d={wavePath(tileW, 5, 22)} fill={WAVE_FRONT} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: WAVE_H,
    overflow: "hidden",
    marginBottom: 6,
  },
  track: {
    flexDirection: "row",
    height: WAVE_H,
  },
  tile: {
    height: WAVE_H,
  },
});
