import React, { useCallback } from "react";
import { Text, StyleSheet, Platform, Vibration, View, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { StoreTheme } from "@/constants/storeTheme";

const MINT = StoreTheme.accentMint;
const MINT_DARK = StoreTheme.accentMintDark;

/** Shared visual height — ADD outline and qty stepper must match exactly. */
export const MENU_ADD_CONTROL_HEIGHT = 36;

function tapFeedback(scale: SharedValue<number>) {
  if (Platform.OS === "android") Vibration.vibrate(10);
  scale.value = withTiming(0.96, { duration: 80 }, () => {
    scale.value = withTiming(1, { duration: 80 });
  });
}

const ADD_HIT_SLOP = { top: 22, bottom: 26, left: 22, right: 22 };
const ADD_PRESS_RETENTION = { top: 36, bottom: 36, left: 36, right: 36 };

type AddButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
  accessibilityLabel?: string;
  style?: object;
};

/** Zomato-style outline ADD — full image width, mint border; fills mint after first add. */
export const StoreMenuAddButton = React.memo(function StoreMenuAddButton({
  onPress,
  disabled = false,
  label = "ADD",
  accessibilityLabel,
  style,
}: AddButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    tapFeedback(scale);
    onPress();
  }, [disabled, onPress, scale]);

  return (
    <View style={styles.addTouchHost} pointerEvents="box-none" collapsable={false}>
      <Pressable
        onPressIn={handlePressIn}
        disabled={disabled}
        hitSlop={ADD_HIT_SLOP}
        pressRetentionOffset={ADD_PRESS_RETENTION}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label} to cart`}
        style={({ pressed }) => [styles.addPressable, style, pressed && !disabled ? styles.pressed : null]}
      >
        <Animated.View
          style={[styles.addBtn, animStyle, disabled && styles.addBtnDisabled]}
        >
          {disabled ? (
            <Text style={[styles.addBtnText, styles.addBtnTextDisabled]}>Closed</Text>
          ) : (
            <View style={styles.addLabelRow} pointerEvents="none">
              <Text style={styles.addBtnText}>{label}</Text>
              <Ionicons name="add" size={14} color={MINT_DARK} />
            </View>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
});

type QtyStepperProps = {
  quantity: number;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  accessibilityLabel?: string;
  style?: object;
};

/** Filled mint stepper — same footprint as ADD outline button. */
export const StoreMenuQtyStepper = React.memo(function StoreMenuQtyStepper({
  quantity,
  disabled = false,
  onIncrement,
  onDecrement,
  accessibilityLabel,
  style,
}: QtyStepperProps) {
  const incScale = useSharedValue(1);
  const decScale = useSharedValue(1);
  const incAnim = useAnimatedStyle(() => ({ transform: [{ scale: incScale.value }] }));
  const decAnim = useAnimatedStyle(() => ({ transform: [{ scale: decScale.value }] }));

  const handleInc = useCallback(() => {
    if (disabled) return;
    tapFeedback(incScale);
    onIncrement();
  }, [disabled, onIncrement, incScale]);

  const handleDec = useCallback(() => {
    if (disabled) return;
    tapFeedback(decScale);
    onDecrement();
  }, [disabled, onDecrement, decScale]);

  return (
    <View
      style={[styles.qtyWrap, disabled && styles.qtyWrapDisabled, style]}
      accessibilityLabel={accessibilityLabel}
      collapsable={false}
    >
      <Pressable
        onPressIn={handleDec}
        disabled={disabled}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        pressRetentionOffset={ADD_PRESS_RETENTION}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        style={styles.qtyHit}
      >
        <Animated.View style={[styles.qtyBtnInner, decAnim]}>
          <Ionicons name="remove" size={17} color="#FFFFFF" />
        </Animated.View>
      </Pressable>
      <Text style={styles.qtyText}>{quantity}</Text>
      <Pressable
        onPressIn={handleInc}
        disabled={disabled}
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        pressRetentionOffset={ADD_PRESS_RETENTION}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        style={styles.qtyHit}
      >
        <Animated.View style={[styles.qtyBtnInner, incAnim]}>
          <Ionicons name="add" size={17} color="#FFFFFF" />
        </Animated.View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
  addTouchHost: {
    width: "100%",
    minHeight: MENU_ADD_CONTROL_HEIGHT,
    alignItems: "stretch",
    justifyContent: "center",
  },
  addPressable: {
    width: "100%",
    height: MENU_ADD_CONTROL_HEIGHT,
    alignItems: "stretch",
    justifyContent: "center",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: MINT_DARK,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: MENU_ADD_CONTROL_HEIGHT,
    width: "100%",
    overflow: "hidden",
    ...StoreTheme.cardShadow,
  },
  addBtnDisabled: {
    borderColor: "#9CA3AF",
    backgroundColor: "#F9FAFB",
    opacity: 0.9,
  },
  addLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "900",
    color: MINT_DARK,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  addBtnTextDisabled: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.2,
    textTransform: "none",
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: MINT,
    borderWidth: 1.5,
    borderColor: MINT_DARK,
    borderRadius: 8,
    paddingHorizontal: 2,
    height: MENU_ADD_CONTROL_HEIGHT,
    width: "100%",
    overflow: "hidden",
    ...StoreTheme.cardShadow,
  },
  qtyWrapDisabled: {
    backgroundColor: "#9CA3AF",
    borderColor: "#6B7280",
    opacity: 0.9,
  },
  qtyHit: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    minWidth: 20,
    textAlign: "center",
  },
});
