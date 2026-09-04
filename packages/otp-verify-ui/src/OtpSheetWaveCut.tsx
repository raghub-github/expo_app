import React from "react";
import Svg, { Path } from "react-native-svg";
import { StyleSheet } from "react-native";

/** CIBIL-style asymmetric top cut — matches merchant login Verify OTP sheet. */
export const OTP_WAVE_H = 56;
export const OTP_WAVE_LOW_Y = 34;

export const OtpSheetWaveCut = React.memo(function OtpSheetWaveCut({ width }: { width: number }) {
  const w = Math.max(320, width);
  const low = OTP_WAVE_LOW_Y;
  const path = [
    `M 0 ${OTP_WAVE_H}`,
    `L 0 10`,
    `Q 0 0 12 0`,
    `L ${w * 0.52} 0`,
    `C ${w * 0.62} 0 ${w * 0.64} ${low} ${w * 0.74} ${low}`,
    `L ${w} ${low}`,
    `L ${w} ${OTP_WAVE_H}`,
    "Z",
  ].join(" ");

  return (
    <Svg width={w} height={OTP_WAVE_H} style={styles.otpWave} pointerEvents="none">
      <Path d={path} fill="#FFFFFF" />
    </Svg>
  );
});

const styles = StyleSheet.create({
  otpWave: {
    alignSelf: "stretch",
  },
});
