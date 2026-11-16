import { useCallback, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { SlideToConfirm } from "@/components/order/SlideToConfirm";
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
  /** Kept for call-site compatibility; slide track uses preparing stage colors. */
  theme?: "light" | "dark";
};

export function MarkAsReadyCountdownButton({
  order,
  nowMs,
  onPress,
  disabled,
  labelPrefix = "Slide to mark ready",
  fullWidth = true,
}: Props) {
  const { label, secondsLeft } = prepReadyCountdownLabel(order, nowMs, {
    prefix: labelPrefix,
    expiredLabel: labelPrefix,
  });
  const remainingRatio = prepReadyTimeRemainingRatio(order, nowMs);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const lockRef = useRef(false);

  const handleConfirmed = useCallback(() => {
    if (disabled || lockRef.current) return;
    lockRef.current = true;
    onPressRef.current();
    setTimeout(() => {
      lockRef.current = false;
    }, 450);
  }, [disabled]);

  return (
    <View style={[styles.wrap, fullWidth && styles.fullWidth]}>
      <SlideToConfirm
        label={label}
        onConfirmed={handleConfirmed}
        disabled={!!disabled}
        stage="preparing"
        urgent={secondsLeft > 0 && secondsLeft <= 120}
        remainingRatio={secondsLeft > 0 ? remainingRatio : 0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "stretch",
  },
  fullWidth: { width: "100%" },
});
