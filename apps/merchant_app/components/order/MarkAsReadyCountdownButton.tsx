import { useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  prepReadyCountdownLabel,
  prepReadyTimeRemainingRatio,
  type PrepCountdownOrder,
} from "@/lib/order-prep-time";

type Props = {
  order: PrepCountdownOrder;
  nowMs: number;
  onPress: () => void;
  disabled?: boolean;
  labelPrefix?: string;
  fullWidth?: boolean;
  theme?: "light" | "dark";
};

export function MarkAsReadyCountdownButton({
  order,
  nowMs,
  onPress,
  disabled,
  labelPrefix = "Order Ready",
  fullWidth = true,
  theme = "dark",
}: Props) {
  const { label } = prepReadyCountdownLabel(order, nowMs, {
    prefix: labelPrefix,
    expiredLabel: labelPrefix,
  });
  const fillRatio = prepReadyTimeRemainingRatio(order, nowMs);
  const isDark = theme === "dark";
  const [btnWidth, setBtnWidth] = useState(0);
  const fillWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (btnWidth <= 0) return;
    Animated.timing(fillWidth, {
      toValue: fillRatio * btnWidth,
      duration: 1000,
      useNativeDriver: false,
    }).start();
  }, [btnWidth, fillRatio, fillWidth]);

  const onLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== btnWidth) {
      setBtnWidth(width);
      fillWidth.setValue(fillRatio * width);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onLayout={onLayout}
      style={({ pressed }) => [
        styles.btn,
        isDark ? styles.btnDark : styles.btnLight,
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Animated.View
        style={[
          isDark ? styles.fillDark : styles.fillLight,
          { width: fillWidth },
        ]}
      />
      {isDark ? <View pointerEvents="none" style={styles.fillSheen} /> : null}
      <Text style={isDark ? styles.labelDark : styles.labelLight}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  btnLight: {
    borderWidth: 1,
    borderColor: "#D4D4D4",
    backgroundColor: "#E8E8E8",
  },
  btnDark: {
    borderWidth: 1,
    borderColor: "rgba(154, 52, 18, 0.25)",
    backgroundColor: "#1E293B",
  },
  fullWidth: { width: "100%" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.92 },
  fillLight: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
  },
  fillDark: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "#EA580C",
  },
  fillSheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
  labelLight: {
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#1A1A1A",
  },
  labelDark: {
    position: "relative",
    zIndex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
