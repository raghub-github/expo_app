import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  StyleSheet,
  Platform,
  Vibration,
  View,
  Pressable,
  type GestureResponderEvent,
} from "react-native";
import { perfMark, perfMeasure } from "@/lib/perfTrace";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";
import { useCartChromeStore } from "@/store/cartChromeStore";
import { useCartStore } from "@/store/cartStore";

/**
 * Cart chrome — forest green outline ADD (white pill) + matching stepper.
 * Matches reference: white shell, green border, "+ Add".
 */
const ADD_GREEN = "#137243";
/** Soft mint fill once qty > 0 — reads “in cart” without fighting the green outline. */
const QTY_FILL = "#E8F5EE";

/** Shared visual height — ADD outline and qty stepper must match exactly. */
export const MENU_ADD_CONTROL_HEIGHT = 40;
/** Slightly taller in-cart stepper; touch zones remain at least 48dp. */
export const MENU_STEPPER_CONTROL_HEIGHT = 48;

function merchantCartTotal(merchantId: string): number {
  const cart = useCartStore.getState();
  if (!merchantCartMatchesRoute(cart.merchantId, merchantId)) return 0;
  return cart.items.reduce((n, item) => n + item.quantity, 0);
}

/**
 * Let React commit the optimistic stepper (+ Continue flash) before the Zustand
 * cart write fans out to every menu-row subscriber. Same-turn `onAdd()` was
 * blocking paint for 2–3s on the full-mount merchant menu.
 */
function afterOptimisticPaint(fn: () => void): void {
  requestAnimationFrame(() => {
    setTimeout(fn, 0);
  });
}

/** Block Add after last-item − so the remounted Add button cannot eat the same finger. */
const REMOVAL_ADD_GUARD_MS = 750;

type InstantCartControlProps = {
  itemKey: string;
  /** Store id — flashes Continue dock on pressIn before cart write. */
  merchantId?: string;
  quantity: number;
  disabled?: boolean;
  /**
   * When false (customisable dishes), skip local optimistic qty — ADD opens a sheet
   * and does not write cart until confirm. Prevents a stuck stepper on sheet cancel.
   */
  allowOptimisticAdd?: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  accessibilityLabel?: string;
};

/**
 * ADD / ± cart control.
 * Fires on `onPressIn` (instant) with `onPress` as fallback when pressIn is cancelled.
 * Optimistic qty + Continue flash paint first; cart store write is deferred one frame.
 * Last-item decrement writes cart immediately and suppresses Add for the same gesture.
 */
export const StoreMenuInstantCartControl = React.memo(function StoreMenuInstantCartControl({
  itemKey,
  merchantId,
  quantity,
  disabled = false,
  allowOptimisticAdd = true,
  onAdd,
  onIncrement,
  onDecrement,
  accessibilityLabel,
}: InstantCartControlProps) {
  const [optimisticQty, setOptimisticQty] = useState<number | null>(null);
  const displayQty = optimisticQty ?? quantity;

  /** Invalidates deferred cart writes from older taps (stops remove→re-add races). */
  const opSeqRef = useRef(0);
  /** After qty hits 0, ignore Add until this timestamp (same-finger remount guard). */
  const ignoreAddUntilRef = useRef(0);

  useEffect(() => {
    setOptimisticQty(null);
    opSeqRef.current += 1;
    ignoreAddUntilRef.current = 0;
  }, [itemKey]);

  useEffect(() => {
    if (optimisticQty != null && quantity === optimisticQty) {
      setOptimisticQty(null);
    }
  }, [quantity, optimisticQty]);

  /**
   * Never snap optimistic 0 back up to a stale cart qty=1 — that looks like an
   * automatic re-add. Keep removal optimism until the cart catches up to 0.
   */
  useEffect(() => {
    if (optimisticQty == null) return;
    const t = setTimeout(() => {
      setOptimisticQty((prev) => {
        if (prev == null) return null;
        if (quantity === prev) return null;
        if (prev === 0 && quantity > 0) return 0;
        return null;
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [optimisticQty, quantity]);

  /**
   * One physical tap = one quantity change.
   * Android can emit pressIn → pressOut → press; clearing the lock on pressOut
   * lets onPress fire a second update. Keep the lock for the whole gesture id.
   */
  const gestureIdRef = useRef(0);
  const firedGestureIdRef = useRef(-1);
  const stepperWidthRef = useRef(0);

  const beginGesture = useCallback(() => {
    gestureIdRef.current += 1;
    return gestureIdRef.current;
  }, []);

  const tryConsumeGesture = useCallback((gestureId: number) => {
    if (disabled) return false;
    if (firedGestureIdRef.current === gestureId) return false;
    firedGestureIdRef.current = gestureId;
    if (Platform.OS === "android") Vibration.vibrate(6);
    return true;
  }, [disabled]);

  const markTap = useCallback(() => {
    perfMark(`tap:${itemKey}`);
    perfMark("tap:last");
  }, [itemKey]);

  const scheduleCartWrite = useCallback((seq: number, fn: () => void) => {
    afterOptimisticPaint(() => {
      if (opSeqRef.current !== seq) return;
      fn();
    });
  }, []);

  const handleAdd = useCallback(() => {
    if (Date.now() < ignoreAddUntilRef.current) return;
    markTap();
    const seq = ++opSeqRef.current;
    if (allowOptimisticAdd) {
      setOptimisticQty((prev) => (prev ?? quantity) + 1);
      if (merchantId) {
        useCartChromeStore.getState().flashAdd(merchantId, 1, merchantCartTotal(merchantId));
      }
      scheduleCartWrite(seq, onAdd);
    } else {
      onAdd();
    }
  }, [allowOptimisticAdd, markTap, merchantId, onAdd, quantity, scheduleCartWrite]);

  const handleInc = useCallback(() => {
    if (Date.now() < ignoreAddUntilRef.current) return;
    markTap();
    const seq = ++opSeqRef.current;
    setOptimisticQty((prev) => (prev ?? quantity) + 1);
    if (merchantId) {
      useCartChromeStore.getState().flashAdd(merchantId, 1, merchantCartTotal(merchantId));
    }
    scheduleCartWrite(seq, onIncrement);
  }, [markTap, merchantId, onIncrement, quantity, scheduleCartWrite]);

  const handleDec = useCallback(() => {
    markTap();
    const seq = ++opSeqRef.current;
    const nextQty = Math.max(0, (optimisticQty ?? quantity) - 1);
    setOptimisticQty(nextQty);
    if (merchantId) {
      useCartChromeStore.getState().flashAdd(merchantId, -1, merchantCartTotal(merchantId));
    }

    if (nextQty === 0) {
      // Same finger remounts Add under the touch — block that ghost press.
      ignoreAddUntilRef.current = Date.now() + REMOVAL_ADD_GUARD_MS;
      // Commit removal immediately so a deferred + / Add cannot win the race.
      onDecrement();
      // Invalidate any older deferred + writes still in the rAF queue.
      opSeqRef.current = seq;
      return;
    }

    scheduleCartWrite(seq, onDecrement);
  }, [markTap, merchantId, onDecrement, optimisticQty, quantity, scheduleCartWrite]);

  type GestureAction = "add" | "increment" | "decrement";

  const fireForGesture = useCallback(
    (gestureId: number, event: GestureResponderEvent, fn: () => void) => {
      event.stopPropagation();
      if (!tryConsumeGesture(gestureId)) return;
      fn();
    },
    [tryConsumeGesture]
  );

  /** Left half → −, right half → + (entire half, not just the glyph). */
  const resolveStepperAction = useCallback((event: GestureResponderEvent): GestureAction => {
    const width = stepperWidthRef.current;
    const x = event.nativeEvent.locationX;
    if (width > 0 && x >= width / 2) return "increment";
    return "decrement";
  }, []);

  const stepperGestureIdRef = useRef(0);

  const fireStepperPressIn = useCallback(
    (event: GestureResponderEvent) => {
      const gestureId = beginGesture();
      stepperGestureIdRef.current = gestureId;
      const action = resolveStepperAction(event);
      fireForGesture(gestureId, event, action === "decrement" ? handleDec : handleInc);
    },
    [beginGesture, fireForGesture, handleDec, handleInc, resolveStepperAction]
  );

  const fireStepperPressFallback = useCallback(
    (event: GestureResponderEvent) => {
      // Same gesture as pressIn — consume only if pressIn never ran / never fired.
      const gestureId = stepperGestureIdRef.current || beginGesture();
      stepperGestureIdRef.current = gestureId;
      const action = resolveStepperAction(event);
      fireForGesture(gestureId, event, action === "decrement" ? handleDec : handleInc);
    },
    [beginGesture, fireForGesture, handleDec, handleInc, resolveStepperAction]
  );

  const addGestureIdRef = useRef(0);

  const fireAddPressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (Date.now() < ignoreAddUntilRef.current) {
        event.stopPropagation();
        return;
      }
      const gestureId = beginGesture();
      addGestureIdRef.current = gestureId;
      fireForGesture(gestureId, event, handleAdd);
    },
    [beginGesture, fireForGesture, handleAdd]
  );

  const fireAddPressFallback = useCallback(
    (event: GestureResponderEvent) => {
      if (Date.now() < ignoreAddUntilRef.current) {
        event.stopPropagation();
        return;
      }
      const gestureId = addGestureIdRef.current || beginGesture();
      addGestureIdRef.current = gestureId;
      fireForGesture(gestureId, event, handleAdd);
    },
    [beginGesture, fireForGesture, handleAdd]
  );

  useEffect(() => {
    if (optimisticQty != null) {
      perfMeasure(`tap:${itemKey}`, "stepper:optimistic");
    }
  }, [itemKey, optimisticQty]);

  useEffect(() => {
    perfMeasure(`tap:${itemKey}`, "row:rendered");
  }, [itemKey, quantity]);

  if (displayQty === 0) {
    const addSuppressed = Date.now() < ignoreAddUntilRef.current;
    return (
      <Pressable
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? "Add to cart"}
        accessibilityState={{ disabled: disabled || addSuppressed }}
        disabled={disabled}
        delayPressIn={0}
        unstable_pressDelay={0}
        onPressIn={fireAddPressIn}
        onPress={fireAddPressFallback}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        pressRetentionOffset={{ top: 24, bottom: 24, left: 24, right: 24 }}
        android_ripple={{ color: "rgba(19, 114, 67, 0.14)", borderless: false }}
        style={({ pressed }) => [
          styles.addPressable,
          pressed && !disabled && !addSuppressed && styles.addPressablePressed,
        ]}
      >
        <View
          style={[styles.addBtn, disabled ? styles.addBtnDisabled : null]}
          pointerEvents="none"
        >
          {disabled ? (
            <AppText style={[styles.addBtnText, styles.addBtnTextDisabled]}>Closed</AppText>
          ) : (
            <View style={styles.addLabelRow}>
              <AppText style={styles.addPlusGlyph}>+</AppText>
              <AppText style={styles.addBtnText}>Add</AppText>
            </View>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Left half decreases quantity. Right half increases quantity."
      accessibilityState={{ disabled }}
      disabled={disabled}
      delayPressIn={0}
      unstable_pressDelay={0}
      onLayout={(event) => {
        stepperWidthRef.current = event.nativeEvent.layout.width;
      }}
      onPressIn={fireStepperPressIn}
      onPress={fireStepperPressFallback}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      pressRetentionOffset={{ top: 20, bottom: 20, left: 20, right: 20 }}
      style={[styles.qtyWrap, disabled && styles.qtyWrapDisabled]}
      collapsable={false}
    >
      <View style={styles.qtyVisualRow} pointerEvents="none" collapsable={false}>
        <AppText style={[styles.qtyGlyph, disabled && styles.qtyGlyphDisabled]}>−</AppText>
        <AppText style={[styles.qtyText, disabled && styles.qtyTextDisabled]}>{displayQty}</AppText>
        <AppText style={[styles.qtyGlyph, disabled && styles.qtyGlyphDisabled]}>+</AppText>
      </View>
    </Pressable>
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
  const fire = useCallback((event: GestureResponderEvent) => {
    event.stopPropagation();
    if (disabled || handledRef.current) return;
    handledRef.current = true;
    if (Platform.OS === "android") Vibration.vibrate(6);
    onPress();
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
      onPress={fire}
      onPressOut={() => {
        // Release after the gesture fully ends so onPress cannot double-fire.
        requestAnimationFrame(() => {
          handledRef.current = false;
        });
      }}
      hitSlop={12}
      pressRetentionOffset={{ top: 24, bottom: 24, left: 24, right: 24 }}
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
          <AppText style={[styles.addBtnText, styles.addBtnTextDisabled]}>Closed</AppText>
        ) : (
          <View style={styles.addLabelRow}>
            <AppText style={styles.addPlusGlyph}>+</AppText>
            <AppText style={styles.addBtnText}>{label === "ADD" ? "Add" : label}</AppText>
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
    height: MENU_STEPPER_CONTROL_HEIGHT,
    borderRadius: CONTROL_RADIUS,
    justifyContent: "center",
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
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: QTY_FILL,
    borderWidth: 1.5,
    borderColor: ADD_GREEN,
    borderRadius: CONTROL_RADIUS,
    height: MENU_STEPPER_CONTROL_HEIGHT,
    width: "100%",
    overflow: "hidden",
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
  /** Always horizontal: −  qty  + */
  qtyVisualRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    zIndex: 1,
  },
  qtyGlyph: {
    fontSize: 18,
    fontWeight: "700",
    color: ADD_GREEN,
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: 22,
    minWidth: 16,
  },
  qtyGlyphDisabled: {
    color: "#9CA3AF",
  },
  qtyText: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: ADD_GREEN,
    letterSpacing: 0.2,
    includeFontPadding: false,
    minWidth: 28,
  },
  qtyTextDisabled: {
    color: "#9CA3AF",
  },
});
