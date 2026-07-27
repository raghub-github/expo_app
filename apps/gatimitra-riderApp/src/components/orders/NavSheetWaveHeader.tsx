/**
 * Verify-OTP style asymmetrical wave cut for navigation bottom sheets.
 */
import React from "react";
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

export const NAV_SHEET_WAVE_H = 56;
export const NAV_SHEET_WAVE_LOW_Y = 34;

export function NavSheetWaveCut({ width: widthProp }: { width?: number }) {
  const { width: winW } = useWindowDimensions();
  const w = Math.max(320, widthProp ?? winW);
  const low = NAV_SHEET_WAVE_LOW_Y;
  const path = [
    `M 0 ${NAV_SHEET_WAVE_H}`,
    `L 0 10`,
    `Q 0 0 12 0`,
    `L ${w * 0.52} 0`,
    `C ${w * 0.62} 0 ${w * 0.64} ${low} ${w * 0.74} ${low}`,
    `L ${w} ${low}`,
    `L ${w} ${NAV_SHEET_WAVE_H}`,
    "Z",
  ].join(" ");

  return (
    <Svg width={w} height={NAV_SHEET_WAVE_H} style={styles.wave} pointerEvents="none">
      <Path d={path} fill="#FFFFFF" />
    </Svg>
  );
}

type ShellProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
};

/** Transparent outer + wave + white body joined under the plateau (OTP sheet pattern). */
export function NavSheetWaveShell({ children, style, bodyStyle }: ShellProps) {
  return (
    <View style={[styles.outer, style]}>
      <NavSheetWaveCut />
      <View style={[styles.body, bodyStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wave: {
    alignSelf: "stretch",
  },
  outer: {
    width: "100%",
    backgroundColor: "transparent",
  },
  body: {
    backgroundColor: "#FFFFFF",
    marginTop: -(NAV_SHEET_WAVE_H - NAV_SHEET_WAVE_LOW_Y),
    paddingTop: 4,
  },
});
