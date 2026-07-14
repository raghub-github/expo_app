import React, { useCallback, useEffect, useRef } from "react";
import {
  Text,
  StyleSheet,
  Platform,
  Vibration,
  View,
  Pressable,
} from "react-native";
import { perfMark, perfMeasure } from "@/lib/perfTrace";

/**
 * Cart chrome — forest green outline ADD (white pill) + matching stepper.
 * Matches reference: white shell, green border, "+ Add".
 */
const ADD_GREEN = "#137243";
/** Soft mint fill once qty > 0 — reads “in cart” without fighting the green outline. */
const QTY_FILL = "#E8F5EE";

/** Shared visual height — ADD outline and qty stepper must match exactly. */
export const MENU_ADD_CONTROL_HEIGHT = 40;

type InstantCartControlProps = {
  itemKey: string;
  quantity: number;
  disabled?: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  accessibilityLabel?: string;
};

/**
 * ADD / ± cart control.
 * Fires on `onPressIn` only (instant) — nested FlashList/ScrollView must not eat the first tap.
 * − | qty | + are three equal flex columns with separate circular hit targets.
 */
export const StoreMenuInstantCartControl = React.memo(function StoreMenuInstantCartControl({
  itemKey,
  quantity,
  disabled = false,
  onAdd,
  onIncrement,
  onDecrement,
  accessibilityLabel,
}: InstantCartControlProps) {
  const displayQty = quantity;

  /**
   * Blocks double-fire if pressIn + press both arrive for one gesture.
   * Keyed by itemKey (not just a timestamp) so a FlashList-recycled row that now
   * represents a different dish is never blocked by the previous dish's lock.
   */
  const lastFiredKeyRef = useRef<string | null>(null);
  const lastFiredAtRef = useRef(0);

  const runOnce = useCallback(
    (fn: () => void) => {
      if (disabled) return;
      const now = Date.now();
      if (lastFiredKeyRef.current === itemKey && now - lastFiredAtRef.current < 90) return;
      lastFiredKeyRef.current = itemKey;
      lastFiredAtRef.current = now;
      if (Platform.OS === "android") Vibration.vibrate(6);
      fn();
    },
    [disabled, itemKey]
  );

  /** Dev-only: earliest possible JS-side timestamp for this tap, before any handler logic runs. */
  const markTap = useCallback(() => {
    perfMark(`tap:${itemKey}`);
    perfMark("tap:last");
  }, [itemKey]);

  const handleAdd = useCallback(() => {
    markTap();
    runOnce(onAdd);
  }, [markTap, onAdd, runOnce]);

  const handleInc = useCallback(() => {
    markTap();
    runOnce(onIncrement);
  }, [markTap, onIncrement, runOnce]);

  const handleDec = useCallback(() => {
    markTap();
    runOnce(onDecrement);
  }, [markTap, onDecrement, runOnce]);

  /**
   * Dev-only: fires once the store update for this tap has propagated back into this
   * row's `quantity` prop and React has committed the re-render — i.e. "stepper visible."
   */
  useEffect(() => {
    perfMeasure(`tap:${itemKey}`, "row:rendered");
  }, [itemKey, quantity]);

  if (displayQty === 0) {
    return (
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? "Add to cart"}
        accessibilityState={{ disabled }}
        disabled={disabled}
        delayPressIn={0}
        unstable_pressDelay={0}
        onPressIn={handleAdd}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        android_ripple={{ color: "rgba(19, 114, 67, 0.14)", borderless: false }}
        style={({ pressed }) => [
          styles.addPressable,
          pressed && !disabled && styles.addPressablePressed,
        ]}
      >
        {/* Paint on View — Pressable style callbacks can fail to show bg on Android. */}
        <View
          style={[styles.addBtn, disabled ? styles.addBtnDisabled : null]}
          pointerEvents="none"
        >
          {disabled ? (
            <Text style={[styles.addBtnText, styles.addBtnTextDisabled]}>Closed</Text>
          ) : (
            <View style={styles.addLabelRow}>
              <Text style={styles.addPlusGlyph}>+</Text>
              <Text style={styles.addBtnText}>Add</Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.qtyWrap, disabled && styles.qtyWrapDisabled]}
      accessibilityLabel={accessibilityLabel}
      collapsable={false}
      pointerEvents="box-none"
    >
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={disabled}
        delayPressIn={0}
        unstable_pressDelay={0}
        onPressIn={handleDec}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 4 }}
        android_ripple={{ color: "rgba(19, 114, 67, 0.14)", borderless: true, radius: 20 }}
        style={({ pressed }) => [styles.qtyHit, pressed && !disabled && styles.qtyHitPressed]}
      >
        <Text
          style={[styles.qtyGlyph, disabled && styles.qtyGlyphDisabled]}
          pointerEvents="none"
        >
          −
        </Text>
      </Pressable>

      <View style={styles.qtyCenter} pointerEvents="none" collapsable={false}>
        <Text style={[styles.qtyText, disabled && styles.qtyTextDisabled]}>{displayQty}</Text>
      </View>

      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={disabled}
        delayPressIn={0}
        unstable_pressDelay={0}
        onPressIn={handleInc}
        hitSlop={{ top: 12, bottom: 12, left: 4, right: 8 }}
        android_ripple={{ color: "rgba(19, 114, 67, 0.14)", borderless: true, radius: 20 }}
        style={({ pressed }) => [styles.qtyHit, pressed && !disabled && styles.qtyHitPressed]}
      >
        <Text
          style={[styles.qtyGlyph, disabled && styles.qtyGlyphDisabled]}
          pointerEvents="none"
        >
          +
        </Text>
      </Pressable>
    </View>
  );
});

/** @deprecated Prefer StoreMenuInstantCartControl */
export const StoreMenuAddButton = React.memo(function StoreMenuAddButton({
  onPress,
  disabled = false,
  label = "Add",
  accessibilityLabel,
  style,
}: {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
  accessibilityLabel?: string;
  style?: object;
}) {
  const handledRef = useRef(false);
  const fire = useCallback(() => {
    if (disabled || handledRef.current) return;
    handledRef.current = true;
    if (Platform.OS === "android") Vibration.vibrate(6);
    onPress();
    setTimeout(() => {
      handledRef.current = false;
    }, 90);
  }, [disabled, onPress]);

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label} to cart`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      delayPressIn={0}
      unstable_pressDelay={0}
      onPressIn={fire}
      hitSlop={10}
      android_ripple={{ color: "rgba(19, 114, 67, 0.14)", borderless: false }}
      style={({ pressed }) => [
        styles.addPressable,
        pressed && !disabled && styles.addPressablePressed,
        style,
      ]}
    >
      <View
        style={[styles.addBtn, disabled ? styles.addBtnDisabled : null]}
        pointerEvents="none"
      >
        {disabled ? (
          <Text style={[styles.addBtnText, styles.addBtnTextDisabled]}>Closed</Text>
        ) : (
          <View style={styles.addLabelRow}>
            <Text style={styles.addPlusGlyph}>+</Text>
            <Text style={styles.addBtnText}>{label === "ADD" ? "Add" : label}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

/** @deprecated Prefer StoreMenuInstantCartControl */
export const StoreMenuQtyStepper = React.memo(function StoreMenuQtyStepper({
  quantity,
  disabled = false,
  onIncrement,
  onDecrement,
  accessibilityLabel,
  style,
}: {
  quantity: number;
  disabled?: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
  accessibilityLabel?: string;
  style?: object;
}) {
  return (
    <View style={style}>
      <StoreMenuInstantCartControl
        itemKey={`legacy-stepper:${accessibilityLabel ?? "qty"}`}
        quantity={quantity}
        disabled={disabled}
        onAdd={onIncrement}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
});

const CONTROL_RADIUS = 8;

const styles = StyleSheet.create({
  addPressable: {
    width: "100%",
    minHeight: MENU_ADD_CONTROL_HEIGHT,
    borderRadius: CONTROL_RADIUS,
    zIndex: 100,
    elevation: 6,
  },
  addPressablePressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  addBtn: {
    width: "100%",
    height: MENU_ADD_CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: ADD_GREEN,
    borderRadius: CONTROL_RADIUS,
    paddingHorizontal: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  addBtnDisabled: {
    backgroundColor: "#F9FAFB",
    borderColor: "#D1D5DB",
    shadowOpacity: 0,
    elevation: 0,
  },
  addLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addPlusGlyph: {
    fontSize: 16,
    fontWeight: "700",
    color: ADD_GREEN,
    lineHeight: 18,
    marginTop: Platform.OS === "android" ? -1 : 0,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: ADD_GREEN,
    letterSpacing: 0.15,
  },
  addBtnTextDisabled: {
    color: "#9CA3AF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: QTY_FILL,
    borderWidth: 1.5,
    borderColor: ADD_GREEN,
    borderRadius: CONTROL_RADIUS,
    height: MENU_ADD_CONTROL_HEIGHT,
    width: "100%",
    /** Equal inset so − / + sit clear of the border on both sides. */
    paddingHorizontal: 12,
    overflow: "visible",
    zIndex: 120,
    elevation: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  qtyWrapDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#D1D5DB",
    shadowOpacity: 0,
    elevation: 0,
  },
  qtyHit: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 28,
    minHeight: MENU_ADD_CONTROL_HEIGHT,
    zIndex: 2,
  },
  qtyHitPressed: {
    opacity: 0.65,
  },
  qtyGlyph: {
    fontSize: 18,
    fontWeight: "700",
    color: ADD_GREEN,
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 22,
    /** Optical balance — minus glyph sits slightly left in some fonts. */
    minWidth: 16,
  },
  qtyGlyphDisabled: {
    color: "#9CA3AF",
  },
  qtyCenter: {
    width: 28,
    flexGrow: 0,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: ADD_GREEN,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  qtyTextDisabled: {
    color: "#9CA3AF",
  },
});
