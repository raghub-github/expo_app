import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  StyleSheet,
  Platform,
  Vibration,
  View,
  Pressable,
  Animated,
  Easing,
  type GestureResponderEvent,
} from "react-native";
import { perfMark, perfMeasure } from "@/lib/perfTrace";
import { cartQtyDebug } from "@/lib/cartQtyDebug";
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
/** Masonry card ADD / stepper — keeps the same gesture model at a smaller size. */
export const MENU_COMPACT_CONTROL_HEIGHT = 36;

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

/**
 * Extra safety after last-item −. Primary protection is the always-mounted
 * Pressable + pressOut lock; this only covers delayed synthetic presses.
 */
const REMOVAL_ADD_GUARD_MS = 1200;
/** Hard gap between committed qty actions — matches checkout stepper lock. */
const ACTION_COOLDOWN_MS = 90;

type InstantCartControlProps = {
  itemKey: string;
  /** Store id — flashes Continue dock on pressIn before cart write. */
  merchantId?: string;
  quantity: number;
  disabled?: boolean;
  /** Compact mint “+” square + slim stepper for masonry cards. */
  size?: "default" | "compact";
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

type GestureAction = "add" | "increment" | "decrement";

/**
 * ADD / ± cart control.
 *
 * CRITICAL: One Pressable stays mounted for both Add and stepper visuals.
 * Swapping Pressables mid-gesture remounts a new responder under the finger and
 * caused: (1) first Add → ghost Increment (0→2), (2) last − → ghost Add (re-add).
 *
 * Fires on `onPressIn` (instant) with `onPress` as fallback when pressIn is cancelled.
 * Optimistic qty + Continue flash paint first; cart store write is deferred one frame.
 * Further actions are locked until `onPressOut` so one finger = one quantity change.
 */
export const StoreMenuInstantCartControl = React.memo(function StoreMenuInstantCartControl({
  itemKey,
  merchantId,
  quantity,
  disabled = false,
  size = "default",
  allowOptimisticAdd = true,
  onAdd,
  onIncrement,
  onDecrement,
  accessibilityLabel,
}: InstantCartControlProps) {
  const compact = size === "compact";
  const [optimisticQty, setOptimisticQty] = useState<number | null>(null);
  const displayQty = optimisticQty ?? quantity;
  const showingAdd = displayQty === 0;

  /**
   * Morph progress: 0 = "+ Add" pill, 1 = "− qty +" stepper. Both visuals stay
   * mounted and cross-fade so the control NEVER shows a blank frame during the
   * swap (the reported bug on the old two-Pressable mount/unmount path).
   * Animation runs only on a genuine 0↔qty transition — mount and FlashList
   * recycle snap instantly to the correct visual to avoid a fade-from-blank flicker.
   */
  const morphProgress = useRef(new Animated.Value(showingAdd ? 0 : 1)).current;
  const morphMountedRef = useRef(false);
  const wasShowingAddRef = useRef(showingAdd);
  const morphItemKeyRef = useRef(itemKey);
  useEffect(() => {
    const target = showingAdd ? 0 : 1;
    // Snap (no animation) on first mount, on FlashList recycle onto a different
    // row, or when the visual hasn't actually flipped — only a genuine 0↔qty
    // change on the SAME row morphs.
    const recycled = morphItemKeyRef.current !== itemKey;
    morphItemKeyRef.current = itemKey;
    if (!morphMountedRef.current || recycled || wasShowingAddRef.current === showingAdd) {
      morphMountedRef.current = true;
      wasShowingAddRef.current = showingAdd;
      morphProgress.setValue(target);
      return;
    }
    wasShowingAddRef.current = showingAdd;
    cartQtyDebug("ui_render", {
      itemKey,
      reason: showingAdd ? "morph_to_add" : "morph_to_stepper",
      displayQty,
    });
    Animated.timing(morphProgress, {
      toValue: target,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [showingAdd, displayQty, itemKey, morphProgress]);

  /** Invalidates deferred cart writes from older taps (stops remove→re-add races). */
  const opSeqRef = useRef(0);
  /** After qty hits 0, ignore Add until this timestamp (delayed synthetic press guard). */
  const ignoreAddUntilRef = useRef(0);

  /**
   * One physical tap = one quantity change.
   * Never clear this on pressOut before onPress — Android can emit
   * pressIn → pressOut → press; clearing early lets onPress double-fire.
   * Instead lock until pressOut AFTER the action, and dedupe by gesture id.
   */
  const gestureIdRef = useRef(0);
  const activeGestureIdRef = useRef(0);
  const firedGestureIdRef = useRef(-1);
  /** Action chosen at pressIn — fallback must reuse it (displayQty may have changed). */
  const gestureActionRef = useRef<GestureAction | null>(null);
  /** Blocks a second cart action until the finger lifts (covers remount ghosts). */
  const lockUntilPressOutRef = useRef(false);
  /** Timestamp of last committed qty action (cooldown). */
  const lastActionAtRef = useRef(0);
  const stepperWidthRef = useRef(0);
  const displayQtyRef = useRef(displayQty);
  displayQtyRef.current = displayQty;

  useEffect(() => {
    setOptimisticQty(null);
    opSeqRef.current += 1;
    ignoreAddUntilRef.current = 0;
    lockUntilPressOutRef.current = false;
    gestureActionRef.current = null;
    firedGestureIdRef.current = -1;
    cartQtyDebug("ui_render", { itemKey, reason: "itemKey_reset", quantity });
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
        if (prev === 0 && quantity > 0) {
          cartQtyDebug("optimistic_update", {
            itemKey,
            reason: "keep_removal_optimism",
            optimisticQty: prev,
            storeQty: quantity,
          });
          return 0;
        }
        return null;
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [optimisticQty, quantity, itemKey]);

  const beginGesture = useCallback(() => {
    gestureIdRef.current += 1;
    return gestureIdRef.current;
  }, []);

  const tryConsumeGesture = useCallback(
    (gestureId: number) => {
      if (disabled) return false;
      if (firedGestureIdRef.current === gestureId) {
        cartQtyDebug("duplicate_blocked", { itemKey, gestureId, reason: "same_gesture_id" });
        return false;
      }
      const now = Date.now();
      if (now - lastActionAtRef.current < ACTION_COOLDOWN_MS) {
        cartQtyDebug("duplicate_blocked", {
          itemKey,
          gestureId,
          reason: "action_cooldown",
          gapMs: now - lastActionAtRef.current,
        });
        return false;
      }
      firedGestureIdRef.current = gestureId;
      lastActionAtRef.current = now;
      if (Platform.OS === "android") Vibration.vibrate(6);
      return true;
    },
    [disabled, itemKey]
  );

  const markTap = useCallback(() => {
    perfMark(`tap:${itemKey}`);
    perfMark("tap:last");
  }, [itemKey]);

  const scheduleCartWrite = useCallback(
    (seq: number, fn: () => void, action: GestureAction) => {
      cartQtyDebug("cart_write_scheduled", { itemKey, seq, action });
      afterOptimisticPaint(() => {
        if (opSeqRef.current !== seq) {
          cartQtyDebug("cart_write_skipped_stale", {
            itemKey,
            seq,
            currentSeq: opSeqRef.current,
            action,
          });
          return;
        }
        cartQtyDebug("cart_write_run", {
          itemKey,
          seq,
          action,
          storeBefore: true,
        });
        cartQtyDebug("store_before", { itemKey, action });
        fn();
        cartQtyDebug("store_after", { itemKey, action });
      });
    },
    [itemKey]
  );

  const handleAdd = useCallback(() => {
    if (Date.now() < ignoreAddUntilRef.current) {
      cartQtyDebug("guard_blocked", { itemKey, action: "add" });
      return;
    }
    markTap();
    const seq = ++opSeqRef.current;
    cartQtyDebug("add_pressed", {
      itemKey,
      seq,
      displayQty: displayQtyRef.current,
      storeQty: quantity,
    });
    if (allowOptimisticAdd) {
      setOptimisticQty((prev) => {
        const next = (prev ?? quantity) + 1;
        cartQtyDebug("optimistic_update", { itemKey, action: "add", from: prev ?? quantity, to: next });
        return next;
      });
      if (merchantId) {
        useCartChromeStore.getState().flashAdd(merchantId, 1, merchantCartTotal(merchantId));
      }
      scheduleCartWrite(seq, onAdd, "add");
    } else {
      onAdd();
    }
  }, [allowOptimisticAdd, itemKey, markTap, merchantId, onAdd, quantity, scheduleCartWrite]);

  const handleInc = useCallback(() => {
    if (Date.now() < ignoreAddUntilRef.current) {
      cartQtyDebug("guard_blocked", { itemKey, action: "increment" });
      return;
    }
    // First tap must go through Add only — never allow + while UI still shows 0.
    if (displayQtyRef.current <= 0) {
      cartQtyDebug("duplicate_blocked", {
        itemKey,
        reason: "increment_while_qty_zero",
        displayQty: displayQtyRef.current,
      });
      return;
    }
    markTap();
    const seq = ++opSeqRef.current;
    cartQtyDebug("increment_pressed", {
      itemKey,
      seq,
      displayQty: displayQtyRef.current,
      storeQty: quantity,
    });
    setOptimisticQty((prev) => {
      const next = (prev ?? quantity) + 1;
      cartQtyDebug("optimistic_update", {
        itemKey,
        action: "increment",
        from: prev ?? quantity,
        to: next,
      });
      return next;
    });
    if (merchantId) {
      useCartChromeStore.getState().flashAdd(merchantId, 1, merchantCartTotal(merchantId));
    }
    scheduleCartWrite(seq, onIncrement, "increment");
  }, [itemKey, markTap, merchantId, onIncrement, quantity, scheduleCartWrite]);

  const handleDec = useCallback(() => {
    markTap();
    const seq = ++opSeqRef.current;
    const nextQty = Math.max(0, (optimisticQty ?? quantity) - 1);
    cartQtyDebug("decrement_pressed", {
      itemKey,
      seq,
      displayQty: displayQtyRef.current,
      storeQty: quantity,
      nextQty,
    });
    setOptimisticQty(nextQty);
    cartQtyDebug("optimistic_update", {
      itemKey,
      action: "decrement",
      from: optimisticQty ?? quantity,
      to: nextQty,
    });
    if (merchantId) {
      useCartChromeStore.getState().flashAdd(merchantId, -1, merchantCartTotal(merchantId));
    }

    if (nextQty === 0) {
      cartQtyDebug("remove_triggered", { itemKey, seq });
      // Same finger must not re-trigger Add after visual swap to "+ Add".
      ignoreAddUntilRef.current = Date.now() + REMOVAL_ADD_GUARD_MS;
      // Commit removal immediately so a deferred + / Add cannot win the race.
      onDecrement();
      // Invalidate ALL deferred writes (including any with this seq still queued).
      opSeqRef.current = seq + 1;
      return;
    }

    scheduleCartWrite(seq, onDecrement, "decrement");
  }, [itemKey, markTap, merchantId, onDecrement, optimisticQty, quantity, scheduleCartWrite]);

  /** Left half → −, right half → + (entire half, not just the glyph). */
  const resolveStepperAction = useCallback((event: GestureResponderEvent): GestureAction => {
    const width = stepperWidthRef.current;
    const x = event.nativeEvent.locationX;
    if (width > 0 && x >= width / 2) return "increment";
    return "decrement";
  }, []);

  const runAction = useCallback(
    (action: GestureAction) => {
      if (action === "add") handleAdd();
      else if (action === "increment") handleInc();
      else handleDec();
    },
    [handleAdd, handleDec, handleInc]
  );

  const resolveActionForPressIn = useCallback(
    (event: GestureResponderEvent): GestureAction | null => {
      const qty = displayQtyRef.current;
      if (qty <= 0) {
        if (Date.now() < ignoreAddUntilRef.current) {
          cartQtyDebug("guard_blocked", { itemKey, action: "add", phase: "press_in" });
          return null;
        }
        return "add";
      }
      return resolveStepperAction(event);
    },
    [itemKey, resolveStepperAction]
  );

  const firePressIn = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      cartQtyDebug("press_in", {
        itemKey,
        displayQty: displayQtyRef.current,
        locked: lockUntilPressOutRef.current,
      });

      if (disabled) return;
      if (lockUntilPressOutRef.current) {
        cartQtyDebug("duplicate_blocked", {
          itemKey,
          reason: "lock_until_press_out",
          phase: "press_in",
        });
        return;
      }

      const action = resolveActionForPressIn(event);
      if (!action) return;

      const gestureId = beginGesture();
      activeGestureIdRef.current = gestureId;
      gestureActionRef.current = action;

      if (!tryConsumeGesture(gestureId)) return;

      lockUntilPressOutRef.current = true;
      runAction(action);
    },
    [beginGesture, disabled, itemKey, resolveActionForPressIn, runAction, tryConsumeGesture]
  );

  const firePressFallback = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      cartQtyDebug("press_fallback", {
        itemKey,
        displayQty: displayQtyRef.current,
        locked: lockUntilPressOutRef.current,
        priorAction: gestureActionRef.current,
        activeGestureId: activeGestureIdRef.current,
        firedGestureId: firedGestureIdRef.current,
      });

      if (disabled) return;

      /**
       * Android often emits pressIn → pressOut → press. pressOut must NOT clear
       * gesture identity before this runs, or a new gestureId + post-Add stepper
       * hit-test would fire Increment (0→2).
       */
      const existingId = activeGestureIdRef.current;
      if (existingId !== 0 && firedGestureIdRef.current === existingId) {
        cartQtyDebug("duplicate_blocked", {
          itemKey,
          reason: "already_handled_by_press_in",
          gestureId: existingId,
        });
        return;
      }

      // Prefer the action captured at pressIn — displayQty may already have flipped.
      let action = gestureActionRef.current;
      const gestureId = existingId || beginGesture();
      activeGestureIdRef.current = gestureId;

      if (!action) {
        // pressIn never ran (cancelled / missed). Resolve from current UI safely.
        if (lockUntilPressOutRef.current) {
          cartQtyDebug("duplicate_blocked", {
            itemKey,
            reason: "lock_until_press_out",
            phase: "press_fallback",
          });
          return;
        }
        if (displayQtyRef.current <= 0) {
          if (Date.now() < ignoreAddUntilRef.current) {
            cartQtyDebug("guard_blocked", { itemKey, action: "add", phase: "press_fallback" });
            return;
          }
          action = "add";
        } else {
          // Fallback-only while stepper is visible: never treat as first Add.
          action = resolveStepperAction(event);
        }
        gestureActionRef.current = action;
      }

      if (!tryConsumeGesture(gestureId)) return;

      lockUntilPressOutRef.current = true;
      runAction(action);
    },
    [beginGesture, disabled, itemKey, resolveStepperAction, runAction, tryConsumeGesture]
  );

  const firePressOut = useCallback(() => {
    cartQtyDebug("press_out", {
      itemKey,
      displayQty: displayQtyRef.current,
      action: gestureActionRef.current,
    });
    /**
     * Delay unlock: Android may deliver `onPress` AFTER `onPressOut`. Clearing
     * immediately would let fallback start a brand-new gesture and double-bump qty.
     */
    requestAnimationFrame(() => {
      setTimeout(() => {
        lockUntilPressOutRef.current = false;
        gestureActionRef.current = null;
        activeGestureIdRef.current = 0;
      }, 48);
    });
  }, [itemKey]);

  useEffect(() => {
    if (optimisticQty != null) {
      perfMeasure(`tap:${itemKey}`, "stepper:optimistic");
    }
  }, [itemKey, optimisticQty]);

  const addSuppressed = showingAdd && Date.now() < ignoreAddUntilRef.current;

  // Cross-fade + subtle scale between the two visuals. Both layers stay mounted;
  // exactly one is fully opaque at rest, so there is never a blank frame.
  const addOpacity = morphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const addScale = morphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9],
  });
  const stepperOpacity = morphProgress;
  const stepperScale = morphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1],
  });
  // Never render "0" while the stepper fades out on last-item removal.
  const stepperQtyLabel = displayQty > 0 ? displayQty : 1;

  return (
    <Pressable
      accessible
      accessibilityRole={showingAdd ? "button" : "adjustable"}
      accessibilityLabel={
        showingAdd ? accessibilityLabel ?? "Add to cart" : accessibilityLabel
      }
      accessibilityHint={
        showingAdd
          ? undefined
          : "Left half decreases quantity. Right half increases quantity."
      }
      accessibilityState={{ disabled: disabled || addSuppressed }}
      disabled={disabled}
      delayPressIn={0}
      unstable_pressDelay={0}
      onLayout={(event) => {
        stepperWidthRef.current = event.nativeEvent.layout.width;
      }}
      onPressIn={firePressIn}
      onPress={firePressFallback}
      onPressOut={firePressOut}
      hitSlop={
        showingAdd
          ? { top: 12, bottom: 12, left: 12, right: 12 }
          : { top: 6, bottom: 6, left: 4, right: 4 }
      }
      pressRetentionOffset={
        showingAdd
          ? { top: 24, bottom: 24, left: 24, right: 24 }
          : { top: 20, bottom: 20, left: 20, right: 20 }
      }
      android_ripple={
        showingAdd ? { color: "rgba(19, 114, 67, 0.14)", borderless: false } : undefined
      }
      style={({ pressed }) => [
        styles.controlShell,
        compact && styles.controlShellCompact,
        showingAdd && pressed && !disabled && !addSuppressed && styles.addPressablePressed,
      ]}
      collapsable={false}
    >
      {/* Stepper layer — under Add so a fresh row paints Add first, no flash. */}
      <Animated.View
        style={[styles.morphLayer, { opacity: stepperOpacity, transform: [{ scale: stepperScale }] }]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.qtyWrap,
            compact && styles.qtyWrapCompact,
            disabled && styles.qtyWrapDisabled,
          ]}
          collapsable={false}
        >
          <View
            style={[styles.qtyVisualRow, compact && styles.qtyVisualRowCompact]}
            pointerEvents="none"
            collapsable={false}
          >
            <AppText
              style={[
                styles.qtyGlyph,
                compact && styles.qtyGlyphCompact,
                disabled && styles.qtyGlyphDisabled,
              ]}
            >
              −
            </AppText>
            <AppText
              style={[
                styles.qtyText,
                compact && styles.qtyTextCompact,
                disabled && styles.qtyTextDisabled,
              ]}
            >
              {stepperQtyLabel}
            </AppText>
            <AppText
              style={[
                styles.qtyGlyph,
                compact && styles.qtyGlyphCompact,
                disabled && styles.qtyGlyphDisabled,
              ]}
            >
              +
            </AppText>
          </View>
        </View>
      </Animated.View>

      {/* Add layer — on top at rest so qty 0 shows the "+ Add" pill. */}
      <Animated.View
        style={[
          styles.morphLayer,
          compact && styles.morphLayerCompactAdd,
          { opacity: addOpacity, transform: [{ scale: addScale }] },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.addBtn,
            compact && styles.addBtnCompact,
            disabled ? styles.addBtnDisabled : null,
            compact && disabled && styles.addBtnCompactDisabled,
          ]}
          pointerEvents="none"
        >
          {disabled ? (
            <AppText
              style={[
                styles.addBtnText,
                styles.addBtnTextDisabled,
                compact && styles.addBtnTextCompactDisabled,
              ]}
            >
              {compact ? "—" : "Closed"}
            </AppText>
          ) : compact ? (
            <AppText style={styles.addPlusGlyphCompact}>+</AppText>
          ) : (
            <View style={styles.addLabelRow}>
              <AppText style={styles.addPlusGlyph}>+</AppText>
              <AppText style={styles.addBtnText}>Add</AppText>
            </View>
          )}
        </View>
      </Animated.View>
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
  const fire = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (disabled || handledRef.current) return;
      handledRef.current = true;
      if (Platform.OS === "android") Vibration.vibrate(6);
      onPress();
    },
    [disabled, onPress]
  );

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
  /** Fixed-size shell that hosts both cross-fading visuals (never changes size). */
  controlShell: {
    width: "100%",
    height: MENU_STEPPER_CONTROL_HEIGHT,
    borderRadius: CONTROL_RADIUS,
    justifyContent: "center",
    alignItems: "stretch",
  },
  controlShellCompact: {
    height: MENU_COMPACT_CONTROL_HEIGHT,
    borderRadius: 10,
    alignItems: "flex-end",
  },
  /** Absolutely-stacked visual layer; opacity is driven by morphProgress. */
  morphLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "stretch",
  },
  morphLayerCompactAdd: {
    alignItems: "flex-end",
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
  addBtnCompact: {
    width: MENU_COMPACT_CONTROL_HEIGHT,
    height: MENU_COMPACT_CONTROL_HEIGHT,
    borderRadius: 10,
    borderWidth: 0,
    paddingHorizontal: 0,
    backgroundColor: "#D1FAE5",
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnCompactDisabled: {
    backgroundColor: "#F3F4F6",
  },
  addPlusGlyphCompact: {
    fontSize: 22,
    fontWeight: "700",
    color: ADD_GREEN,
    lineHeight: 24,
    marginTop: Platform.OS === "android" ? -1 : 0,
  },
  addBtnTextCompactDisabled: {
    fontSize: 14,
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
  qtyWrapCompact: {
    height: MENU_COMPACT_CONTROL_HEIGHT,
    borderRadius: 10,
  },
  qtyVisualRowCompact: {
    paddingHorizontal: 8,
  },
  qtyGlyphCompact: {
    fontSize: 16,
    lineHeight: 18,
    minWidth: 12,
  },
  qtyTextCompact: {
    fontSize: 13,
    minWidth: 18,
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
