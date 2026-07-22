import React, { type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RidePickupOtpEntry } from "@/src/components/orders/RidePickupOtpEntry";
import { LORA_BOLD } from "@/src/theme/headerFonts";

/** Same CIBIL-style cut as merchant login Verify OTP sheet. */
const OTP_WAVE_H = 56;
const OTP_WAVE_LOW_Y = 34;

type Props = {
  title: string;
  subtitle: string;
  compactSubtitle?: string;
  /** @deprecated Kept for call-site compatibility — unused. */
  iconName?: string;
  /** @deprecated Kept for call-site compatibility — unused. */
  headerGradient?: [string, string];
  /** @deprecated Kept for call-site compatibility — unused. */
  badgeGradient?: [string, string];
  error?: string | null;
  loading?: boolean;
  resetKey?: number;
  otpMode: "food" | "ride" | "delivery";
  autoSubmit?: boolean;
  autoFocus?: boolean;
  inputMode?: "system" | "keypad";
  onSubmit: (otp: string) => void;
  onCancel?: () => void;
  onClearError?: () => void;
  prependContent?: ReactNode;
};

function OtpSheetWaveCut({ width }: { width: number }) {
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
}

export function OrderOtpVerifySheetContent({
  title,
  subtitle,
  compactSubtitle: _compactSubtitle,
  error,
  loading = false,
  resetKey = 0,
  otpMode,
  autoSubmit = true,
  autoFocus: _autoFocus = true,
  inputMode = "system",
  onSubmit,
  onCancel: _onCancel,
  onClearError,
  prependContent,
}: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetBottomPad = Math.max(insets.bottom, 12) + 16;

  return (
    <View style={styles.root}>
      <View style={styles.otpSheetOuter} pointerEvents="box-none">
        <OtpSheetWaveCut width={width} />
        <View style={[styles.otpSheet, { paddingBottom: sheetBottomPad }]}>
          <Text style={styles.otpSheetTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.otpSheetSub}>{subtitle}</Text>

          {prependContent ? <View style={styles.prependWrap}>{prependContent}</View> : null}

          <RidePickupOtpEntry
            loading={loading}
            error={error}
            resetKey={resetKey}
            mode={otpMode}
            autoSubmit={autoSubmit}
            inputMode={inputMode}
            pinStyle="underline"
            hideSectionCopy
            onSubmit={onSubmit}
            onErrorClear={onClearError}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: "transparent",
  },
  otpSheetOuter: {
    width: "100%",
  },
  otpWave: {
    alignSelf: "stretch",
  },
  otpSheet: {
    backgroundColor: "#FFFFFF",
    marginTop: -(OTP_WAVE_H - OTP_WAVE_LOW_Y),
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  otpSheetTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 18,
    color: "#0F172A",
    marginTop: -(OTP_WAVE_LOW_Y - 14),
    marginBottom: 10,
  },
  otpSheetSub: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    lineHeight: 18,
    color: "#64748B",
    marginBottom: 18,
  },
  prependWrap: {
    width: "100%",
    marginBottom: 12,
  },
});
