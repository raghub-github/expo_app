import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  StyleSheet,
  Platform,
  Vibration,
  View,
  Pressable,
  TouchableOpacity,
  Animated,
  Easing,
  type GestureResponderEvent,
  type StyleProp,
  type TextStyle,
} from "react-native";
import { perfMark, perfMeasure } from "@/lib/perfTrace";
import { cartQtyDebug } from "@/lib/cartQtyDebug";
import { merchantCartMatchesRoute } from "@/lib/merchantRouteId";
import { useCartChromeStore } from "@/store/cartChromeStore";
import { useCartStore } from "@/store/cartStore";
import { StoreTheme } from "@/constants/storeTheme";
import { MerchantDarkPalette } from "@/features/merchant-detail/merchantUiTheme";

/**
 * Cart chrome — forest green outline ADD (white pill) + matching stepper.
 * Matches reference: white shell, green border, "+ Add".
 */
const ADD_GREEN = "#137243";
/** Past-order / reorder rows — GatiMitra mint, "ADD +" caps layout. */
const ADD_REORDER = StoreTheme.accentMintDark;

/** Shared visual height — ADD outline and qty stepper must match exactly. */
export const MENU_ADD_CONTROL_HEIGHT = 40;
/** Slightly taller in-cart stepper; touch zones remain at least 48dp. */
export const MENU_STEPPER_CONTROL_HEIGHT = 48;
/** Masonry card ADD / stepper — keeps the same gesture model at a smaller size. */
export const MENU_COMPACT_CONTROL_HEIGHT = 36;
/** Home on-image circular + diameter (visual). */
export const MENU_CIRCLE_CONTROL_SIZE = 38;
/**
 * Reserved shell width for circle size — always the stepper width so + → stepper
 * never changes layout size (eliminates jerk / neighbor reflow / card jump).
 */
export const MENU_CIRCLE_STEPPER_WIDTH = 100;
/** On-image / compact stepper corner radius — rounded rect, not a full pill. */
export const MENU_STEPPER_RADIUS = 10;

/** Corner inset when + / stepper sits directly on the image (no mint curve). */
export const ON_IMAGE_CONTROL_INSET = 8;

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
 * Qty digit that slides on deliberate taps; snaps on rapid continuous taps
 * so digits never stack/overlap while the user is mashing + / −.
 */
const QTY_SLIDE_RAPID_MS = 240;

function SlidingQtyLabel({
  value,
  direction,
  textStyle,
  color,
}: {
  value: number;
  /** +1 = increment (slide up), −1 = decrement (slide down). */
  direction: 1 | -1;
  textStyle?: StyleProp<TextStyle>;
  color?: string;
}) {
  const prevValueRef = useRef(value);
  const lastChangeAtRef = useRef(0);
  const anim = useRef(new Animated.Value(1)).current;
  const [frame, setFrame] = useState({
    outgoing: value,
    incoming: value,
    dir: 1 as 1 | -1,
    sliding: false,
  });

  useEffect(() => {
    if (value === prevValueRef.current) return;
    const now = Date.now();
    const rapid = now - lastChangeAtRef.current < QTY_SLIDE_RAPID_MS;
    lastChangeAtRef.current = now;
    const dir = direction;
    const from = prevValueRef.current;
    prevValueRef.current = value;

    if (rapid) {
      // Continuous click — snap to the latest number, cancel any in-flight slide.
      anim.stopAnimation();
      anim.setValue(1);
      setFrame({ outgoing: value, incoming: value, dir, sliding: false });
      return;
    }

    // Deliberate tap — slide old out / new in.
    setFrame({ outgoing: from, incoming: value, dir, sliding: true });
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setFrame((prev) =>
        prev.incoming === value
          ? { outgoing: value, incoming: value, dir, sliding: false }
          : prev
      );
    });
  }, [value, direction, anim]);

  const travel = 12;
  const outgoingY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, frame.dir === 1 ? -travel : travel],
  });
  const incomingY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [frame.dir === 1 ? travel : -travel, 0],
  });
  const outgoingOp = anim.interpolate({
    inputRange: [0, 0.85, 1],
    outputRange: [1, 0.15, 0],
  });
  const incomingOp = anim.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.85, 1],
  });

  if (!frame.sliding) {
    return (
      <View style={slidingQtyStyles.slot} pointerEvents="none">
        <AppText style={[textStyle, color ? { color } : null]}>{frame.incoming}</AppText>
      </View>
    );
  }

  return (
    <View style={slidingQtyStyles.slot} pointerEvents="none">
      <Animated.View
        style={[
          slidingQtyStyles.layer,
          { opacity: outgoingOp, transform: [{ translateY: outgoingY }] },
        ]}
      >
        <AppText style={[textStyle, color ? { color } : null]}>{frame.outgoing}</AppText>
      </Animated.View>
      <Animated.View
        style={[
          slidingQtyStyles.layer,
          { opacity: incomingOp, transform: [{ translateY: incomingY }] },
        ]}
      >
        <AppText style={[textStyle, color ? { color } : null]}>{frame.incoming}</AppText>
      </Animated.View>
    </View>
  );
}

const slidingQtyStyles = StyleSheet.create({
  slot: {
    minWidth: 28,
    width: 28,
    height: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});

/**
 * Extra safety after last-item −. Primary protection is the always-mounted
 * Pressable + pressOut lock; this only covers delayed synthetic presses.
 */
/** After last-item removal, briefly ignore Add so −→Add ghost remounts don't re-add. */
const REMOVAL_ADD_GUARD_MS = 180;
/** Hard gap between committed qty actions — keep short so taps feel instant. */
const ACTION_COOLDOWN_MS = 45;

type InstantCartControlProps = {
  itemKey: string;
  /** Store id — flashes Continue dock on pressIn before cart write. */
  merchantId?: string;
  quantity: number;
  disabled?: boolean;
  /**
   * When true (and store is open), show red "Sold Out" instead of gray "Closed".
   * Closed always wins when `disabled` is from store hours.
   */
  soldOut?: boolean;
  /** Compact mint “+” square + slim stepper for masonry cards. Circle = home on-image +. */
  size?: "default" | "compact" | "circle";
  /** Green (menu default) vs pink (past-order / reorder rows). */
  accent?: "default" | "zomato";
  /** Discovery dark store — charcoal ADD shell instead of white. */
  darkSurface?: boolean;
  /**
   * When false (customisable dishes), skip local optimistic qty — ADD opens a sheet
   * and does not write cart until confirm. Prevents a stuck stepper on sheet cancel.
   */
  allowOptimisticAdd?: boolean;
  /**
   * Circle size: white corner cradle behind the control. Width tracks displayQty
   * so + stays tight and the stepper pad expands smoothly.
   */
  imageCornerCutout?: boolean;
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
  soldOut = false,
  size = "default",
  accent = "default",
  darkSurface = false,
  allowOptimisticAdd = true,
  imageCornerCutout = false,
  onAdd,
  onIncrement,
  onDecrement,
  accessibilityLabel,
}: InstantCartControlProps) {
  const compact = size === "compact" || size === "circle";
  const circle = size === "circle";
  /** OOS while store open → red Sold Out; store closed → gray Closed. */
  const unavailableLabel = soldOut ? "Sold Out" : "Closed";
  const unavailableSoldOutStyle = Boolean(soldOut);
  const zomato = accent === "zomato";
  const accentColor = darkSurface
    ? MerchantDarkPalette.accent
    : zomato
      ? ADD_REORDER
      : ADD_GREEN;
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
      duration: 90,
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
  /** Last ± direction for SlidingQtyLabel (1 = +, −1 = −). */
  const qtySlideDirRef = useRef<1 | -1>(1);

  useEffect(() => {
    setOptimisticQty(null);
    opSeqRef.current += 1;
    ignoreAddUntilRef.current = 0;
    lockUntilPressOutRef.current = false;
    gestureActionRef.current = null;
    firedGestureIdRef.current = -1;
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
      // Paint optimistic stepper first — sync cart write was blocking the whole
      // merchant VirtualizedList (~300–900ms) before the UI could flip.
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
    qtySlideDirRef.current = 1;
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
    qtySlideDirRef.current = -1;
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

  /** Instant − / + halves — cooldown only, no pressOut lock (that ate rapid taps). */
  const runStepperHalf = useCallback(
    (action: "increment" | "decrement") => {
      if (disabled) return;
      if (displayQtyRef.current <= 0) return;
      const now = Date.now();
      if (now - lastActionAtRef.current < ACTION_COOLDOWN_MS) {
        cartQtyDebug("duplicate_blocked", {
          itemKey,
          reason: "action_cooldown",
          phase: "stepper_half",
        });
        return;
      }
      lastActionAtRef.current = now;
      runAction(action);
    },
    [disabled, itemKey, runAction]
  );

  const resolveActionForPressIn = useCallback(
    (event: GestureResponderEvent): GestureAction | null => {
      const qty = displayQtyRef.current;
      if (qty <= 0) {
        if (Date.now() < ignoreAddUntilRef.current) {
          cartQtyDebug("guard_blocked", { itemKey, action: "add", phase: "press_in" });
          return null;
        }
        /**
         * Legacy non-cutout circle reserved a full stepper-wide shell and only the
         * right glyph was tappable. Cutout dock is already + sized — any press is Add.
         */
        if (circle && !imageCornerCutout) {
          const width = stepperWidthRef.current;
          const x = event.nativeEvent.locationX;
          if (width > MENU_CIRCLE_CONTROL_SIZE + 4 && x < width - MENU_CIRCLE_CONTROL_SIZE - 2) {
            return null;
          }
        }
        return "add";
      }
      return resolveStepperAction(event);
    },
    [circle, imageCornerCutout, itemKey, resolveStepperAction]
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
          if (circle && !imageCornerCutout) {
            const width = stepperWidthRef.current;
            const x = event.nativeEvent.locationX;
            if (width > MENU_CIRCLE_CONTROL_SIZE + 4 && x < width - MENU_CIRCLE_CONTROL_SIZE - 2) {
              return;
            }
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
    [
      beginGesture,
      circle,
      disabled,
      imageCornerCutout,
      itemKey,
      resolveStepperAction,
      runAction,
      tryConsumeGesture,
    ]
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

  // Cross-fade between the two visuals. Both layers stay mounted; shell size is
  // constant for circle/compact so the product card never reflows. Circle skips
  // scale — scaling a right-anchored + inside a wider reserved shell looks like a jerk.
  const addOpacity = morphProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const addScale = circle
    ? 1
    : morphProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.9],
      });
  const stepperOpacity = morphProgress;
  const stepperScale = circle
    ? 1
    : morphProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0.9, 1],
      });
  // Never render "0" while the stepper fades out on last-item removal.
  const stepperQtyLabel = displayQty > 0 ? displayQty : 1;
  const qtySlideDir = qtySlideDirRef.current;

  const useCutoutCradle = circle && imageCornerCutout;

  const fireCutoutAdd = useCallback(() => {
    if (disabled || addSuppressed) return;
    if (Date.now() < ignoreAddUntilRef.current) {
      cartQtyDebug("guard_blocked", { itemKey, action: "add", phase: "cutout_touch" });
      return;
    }
    const now = Date.now();
    if (now - lastActionAtRef.current < ACTION_COOLDOWN_MS) {
      cartQtyDebug("duplicate_blocked", {
        itemKey,
        reason: "action_cooldown",
        phase: "cutout_touch",
      });
      return;
    }
    lastActionAtRef.current = now;
    runAction("add");
  }, [addSuppressed, disabled, itemKey, runAction]);

  /**
   * Cutout cards: + / stepper sit directly on the image (no mint curve).
   * Compact host so empty dock space cannot steal taps from the control.
   */
  if (useCutoutCradle) {
    return (
      <View
        style={[styles.onImageHost, !showingAdd && styles.onImageHostStepperFlush]}
        collapsable={false}
        pointerEvents="box-none"
      >
        {showingAdd ? (
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? "Add to cart"}
            accessibilityState={{ disabled: disabled || addSuppressed }}
            disabled={disabled || addSuppressed}
            delayPressIn={0}
            unstable_pressDelay={0}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            onPressIn={(event) => {
              event.stopPropagation?.();
              fireCutoutAdd();
            }}
            style={styles.cutoutPlusHit}
            collapsable={false}
          >
            {({ pressed }) => (
              <View
                style={[styles.cutoutPlusBtn, pressed && styles.cutoutPlusBtnPressed]}
                pointerEvents="none"
                collapsable={false}
              >
                <AppText style={styles.addPlusGlyphOnCurve}>+</AppText>
              </View>
            )}
          </Pressable>
        ) : (
          <View
            style={[styles.cutoutStepperFrame, { borderColor: accentColor }]}
            collapsable={false}
          >
            <View style={styles.stepperVisualRow} pointerEvents="none" collapsable={false}>
              <AppText style={styles.qtyGlyphBordered}>−</AppText>
              <SlidingQtyLabel
                value={stepperQtyLabel}
                direction={qtySlideDir}
                textStyle={styles.qtyTextBordered}
              />
              <AppText style={styles.qtyGlyphBordered}>+</AppText>
            </View>
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
              disabled={disabled}
              delayPressIn={0}
              unstable_pressDelay={0}
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 4 }}
              onPressIn={(event) => {
                event.stopPropagation?.();
                runStepperHalf("decrement");
              }}
              style={styles.stepperHitLeft}
              collapsable={false}
            />
            <Pressable
              accessible
              accessibilityRole="button"
              accessibilityLabel="Increase quantity"
              disabled={disabled}
              delayPressIn={0}
              unstable_pressDelay={0}
              hitSlop={{ top: 14, bottom: 14, left: 4, right: 14 }}
              onPressIn={(event) => {
                event.stopPropagation?.();
                runStepperHalf("increment");
              }}
              style={styles.stepperHitRight}
              collapsable={false}
            />
          </View>
        )}
      </View>
    );
  }

  const shellStyle = [
    styles.controlShell,
    compact && !circle && styles.controlShellCompact,
    circle && styles.controlShellCircle,
    circle && displayQty > 0 && styles.controlShellCircleStepper,
  ];

  const morphContent = (
    <>
      {/* Stepper layer — under Add so a fresh row paints Add first, no flash. */}
      <Animated.View
        style={[styles.morphLayer, { opacity: stepperOpacity, transform: [{ scale: stepperScale }] }]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.qtyWrap,
            compact && styles.qtyWrapCompact,
            circle && styles.qtyWrapCircle,
            {
              backgroundColor: "#FFFFFF",
              borderColor: accentColor,
            },
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
                { color: accentColor },
                disabled && styles.qtyGlyphDisabled,
              ]}
            >
              −
            </AppText>
            <SlidingQtyLabel
              value={stepperQtyLabel}
              direction={qtySlideDir}
              textStyle={[
                styles.qtyText,
                compact && styles.qtyTextCompact,
                disabled && styles.qtyTextDisabled,
              ]}
              color={disabled ? undefined : accentColor}
            />
            <AppText
              style={[
                styles.qtyGlyph,
                compact && styles.qtyGlyphCompact,
                { color: accentColor },
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
          circle && styles.morphLayerCircleAdd,
          { opacity: addOpacity, transform: [{ scale: addScale }] },
        ]}
        pointerEvents="none"
      >
        <View
          style={[
            styles.addBtn,
            compact && styles.addBtnCompact,
            circle && styles.addBtnCircle,
            zomato && styles.addBtnZomato,
            zomato && { borderColor: accentColor },
            darkSurface && styles.addBtnDark,
            darkSurface && { borderColor: accentColor },
            disabled ? styles.addBtnDisabled : null,
            disabled && unavailableSoldOutStyle ? styles.addBtnSoldOut : null,
            compact && disabled && styles.addBtnCompactDisabled,
            !zomato && !darkSurface && compact ? { borderColor: accentColor } : null,
          ]}
          pointerEvents="none"
        >
          {disabled ? (
            <AppText
              style={[
                styles.addBtnText,
                styles.addBtnTextDisabled,
                unavailableSoldOutStyle && styles.addBtnTextSoldOut,
                compact && styles.addBtnTextCompactDisabled,
              ]}
            >
              {compact || circle ? "—" : unavailableLabel}
            </AppText>
          ) : compact || circle ? (
            <AppText style={[styles.addPlusGlyphCompact, { color: accentColor }]}>+</AppText>
          ) : zomato ? (
            <View style={styles.addLabelRow}>
              <AppText style={[styles.addBtnText, styles.addBtnTextZomato, { color: accentColor }]}>
                ADD
              </AppText>
              <AppText style={[styles.addPlusGlyph, { color: accentColor }]}>+</AppText>
            </View>
          ) : (
            <View style={styles.addLabelRow}>
              <AppText style={[styles.addPlusGlyph, { color: accentColor }]}>+</AppText>
              <AppText style={[styles.addBtnText, { color: accentColor }]}>Add</AppText>
            </View>
          )}
        </View>
      </Animated.View>
    </>
  );

  return (
    <View
      style={[
        circle ? styles.circleHost : undefined,
        circle && (displayQty > 0 ? styles.circleHostStepper : styles.circleHostPlus),
      ]}
      collapsable={false}
      pointerEvents="box-none"
    >
      {/* Compact / circle stepper: full-bleed left/right hit layers cover the border edges. */}
      {compact && !showingAdd ? (
        <View
          style={[
            styles.qtyWrap,
            compact && styles.qtyWrapCompact,
            circle && styles.qtyWrapCircle,
            {
              backgroundColor: "#FFFFFF",
              borderColor: accentColor,
            },
            disabled && styles.qtyWrapDisabled,
          ]}
          collapsable={false}
        >
          <View style={styles.stepperVisualRow} pointerEvents="none" collapsable={false}>
            <AppText
              style={[
                styles.qtyGlyph,
                compact && styles.qtyGlyphCompact,
                { color: accentColor },
                disabled && styles.qtyGlyphDisabled,
              ]}
            >
              −
            </AppText>
            <SlidingQtyLabel
              value={stepperQtyLabel}
              direction={qtySlideDir}
              textStyle={[
                styles.qtyText,
                compact && styles.qtyTextCompact,
                disabled && styles.qtyTextDisabled,
              ]}
              color={disabled ? undefined : accentColor}
            />
            <AppText
              style={[
                styles.qtyGlyph,
                compact && styles.qtyGlyphCompact,
                { color: accentColor },
                disabled && styles.qtyGlyphDisabled,
              ]}
            >
              +
            </AppText>
          </View>
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Decrease quantity"
            disabled={disabled}
            delayPressIn={0}
            unstable_pressDelay={0}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 4 }}
            onPressIn={(event) => {
              event.stopPropagation?.();
              runStepperHalf("decrement");
            }}
            style={styles.stepperHitLeft}
            collapsable={false}
          />
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel="Increase quantity"
            disabled={disabled}
            delayPressIn={0}
            unstable_pressDelay={0}
            hitSlop={{ top: 14, bottom: 14, left: 4, right: 14 }}
            onPressIn={(event) => {
              event.stopPropagation?.();
              runStepperHalf("increment");
            }}
            style={styles.stepperHitRight}
            collapsable={false}
          />
        </View>
      ) : (
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
        onPressIn={(event) => {
          event.stopPropagation?.();
          firePressIn(event);
        }}
        onPress={(event) => {
          event.stopPropagation?.();
          firePressFallback(event);
        }}
        onPressOut={firePressOut}
        hitSlop={
          circle
            ? { top: 4, bottom: 4, left: 4, right: 4 }
            : showingAdd
              ? { top: 12, bottom: 12, left: 12, right: 12 }
              : { top: 6, bottom: 6, left: 4, right: 4 }
        }
        pressRetentionOffset={
          circle
            ? { top: 12, bottom: 12, left: 12, right: 12 }
            : showingAdd
              ? { top: 24, bottom: 24, left: 24, right: 24 }
              : { top: 20, bottom: 20, left: 20, right: 20 }
        }
        android_ripple={
          showingAdd && !circle
            ? { color: "rgba(19, 114, 67, 0.14)", borderless: false }
            : undefined
        }
        style={({ pressed }) => [
          ...shellStyle,
          pressed &&
            !disabled &&
            !addSuppressed &&
            showingAdd &&
            !circle &&
            styles.addPressablePressed,
        ]}
        collapsable={false}
      >
        {morphContent}
      </Pressable>
      )}
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
  circleHost: {
    /**
     * Host width tracks the visual (tight + vs full stepper) so we never reserve a
     * white stepper-width slab under a lone +. Absolute dock — no card reflow.
     */
    alignSelf: "flex-end",
    overflow: "visible",
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  circleHostPlus: {
    width: MENU_CIRCLE_CONTROL_SIZE,
    height: MENU_CIRCLE_CONTROL_SIZE,
  },
  circleHostStepper: {
    width: MENU_CIRCLE_STEPPER_WIDTH,
    height: MENU_CIRCLE_CONTROL_SIZE,
  },
  /**
   * + / stepper sit directly on the dish image (no mint curve dock).
   */
  onImageHost: {
    alignSelf: "flex-end",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingRight: 0,
    paddingBottom: 0,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  /** Stepper: flush to the image’s right edge (no inset). */
  onImageHostStepperFlush: {
    paddingRight: 0,
  },
  /** Hit target — paint lives on the inner View (Pressable bg can fail to draw). */
  cutoutPlusHit: {
    width: MENU_CIRCLE_CONTROL_SIZE,
    height: MENU_CIRCLE_CONTROL_SIZE,
  },
  /** Green + — solid View so the circle always paints on Android/home rails. */
  cutoutPlusBtn: {
    width: MENU_CIRCLE_CONTROL_SIZE,
    height: MENU_CIRCLE_CONTROL_SIZE,
    borderRadius: MENU_CIRCLE_CONTROL_SIZE / 2,
    backgroundColor: ADD_GREEN,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 8,
      },
      default: {},
    }),
  },
  cutoutPlusBtnPressed: {
    opacity: 0.82,
  },
  /** Outer frame draws the green border so Pressable presses never wash it out. */
  cutoutStepperFrame: {
    width: MENU_CIRCLE_STEPPER_WIDTH,
    height: MENU_CIRCLE_CONTROL_SIZE,
    borderRadius: MENU_STEPPER_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: ADD_GREEN,
    zIndex: 2,
    overflow: "visible",
  },
  /** Full half overlays — include the border stroke so edge taps still register. */
  stepperHitLeft: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "50%",
    zIndex: 4,
  },
  stepperHitRight: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: "50%",
    zIndex: 4,
  },
  stepperVisualRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 1,
  },
  cutoutHalfBtn: {
    minWidth: 34,
    height: MENU_CIRCLE_CONTROL_SIZE - 6,
    alignItems: "center",
    justifyContent: "center",
  },
  compactHalfBtn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  /** @deprecated kept for morph default-size stepper shell */
  cutoutStepper: {
    width: MENU_CIRCLE_STEPPER_WIDTH,
    height: MENU_CIRCLE_CONTROL_SIZE,
    borderRadius: MENU_STEPPER_RADIUS,
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: ADD_GREEN,
    zIndex: 2,
    overflow: "visible",
  },
  cutoutStepperInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: MENU_CIRCLE_CONTROL_SIZE,
  },
  controlShellCompact: {
    height: MENU_COMPACT_CONTROL_HEIGHT,
    minWidth: 96,
    width: "100%",
    borderRadius: 10,
    alignItems: "stretch",
    overflow: "visible",
    zIndex: 6,
  },
  /**
   * Circle shell — size matches the green + / stepper; host padding supplies the cradle gap.
   */
  controlShellCircle: {
    width: MENU_CIRCLE_CONTROL_SIZE,
    height: MENU_CIRCLE_CONTROL_SIZE,
    minWidth: MENU_CIRCLE_CONTROL_SIZE,
    borderRadius: MENU_CIRCLE_CONTROL_SIZE / 2,
    alignItems: "stretch",
    alignSelf: "flex-end",
    overflow: "visible",
  },
  controlShellCircleStepper: {
    width: MENU_CIRCLE_STEPPER_WIDTH,
    minWidth: MENU_CIRCLE_STEPPER_WIDTH,
  },
  /** Sit above the SVG curve. No elevation — Android + overflow:hidden breaks hit-testing. */
  controlShellOnCurve: {
    zIndex: 2,
  },
  /** Expand + hit box to the full padded dock so curve taps register as Add. */
  controlShellCutoutAddHit: {
    width: "100%",
    minWidth: MENU_CIRCLE_CONTROL_SIZE,
    height: "100%",
    minHeight: MENU_CIRCLE_CONTROL_SIZE,
    alignSelf: "stretch",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  /** Absolutely-stacked visual layer; opacity is driven by morphProgress. */
  morphLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "stretch",
    overflow: "visible",
  },
  morphLayerCompactAdd: {
    alignItems: "flex-end",
  },
  morphLayerCircleAdd: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
  },
  addPressablePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.94 }],
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
  addBtnSoldOut: {
    backgroundColor: "#DC2626",
    borderColor: "#DC2626",
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnZomato: {
    borderWidth: 1,
    borderRadius: 8,
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnDark: {
    backgroundColor: MerchantDarkPalette.card,
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnTextZomato: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  addBtnCompact: {
    width: MENU_COMPACT_CONTROL_HEIGHT,
    height: MENU_COMPACT_CONTROL_HEIGHT,
    borderRadius: MENU_STEPPER_RADIUS,
    borderWidth: 2.5,
    borderColor: ADD_GREEN,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
    shadowOpacity: 0,
    elevation: 0,
  },
  addBtnCircle: {
    width: MENU_CIRCLE_CONTROL_SIZE,
    height: MENU_CIRCLE_CONTROL_SIZE,
    borderRadius: MENU_CIRCLE_CONTROL_SIZE / 2,
    borderWidth: 2.5,
    borderColor: ADD_GREEN,
    paddingHorizontal: 0,
    backgroundColor: "#FFFFFF",
    shadowOpacity: 0,
    elevation: 0,
  },
  /** Solid green circle + 2px dark ring; white bold +. No elevation (touch-safe). */
  addBtnCircleOnCurve: {
    backgroundColor: ADD_GREEN,
    borderWidth: 0,
  },
  addPlusGlyphOnCurve: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 28,
    includeFontPadding: false,
    marginTop: Platform.OS === "android" ? -2 : 0,
  },
  qtyWrapOnCurve: {
    backgroundColor: "#FFFFFF",
    borderWidth: 0,
    borderRadius: MENU_CIRCLE_CONTROL_SIZE / 2,
  },
  qtyVisualRowOnCurve: {
    paddingHorizontal: 12,
  },
  qtyCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ADD_GREEN,
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyGlyphOnCurve: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 18,
    minWidth: 0,
    includeFontPadding: false,
  },
  /** Reference stepper: accent − / + on white pill (no filled circles). */
  qtyGlyphBordered: {
    color: ADD_GREEN,
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 26,
    minWidth: 22,
    textAlign: "center",
    includeFontPadding: false,
  },
  /** Same accent as border / glyphs — matches reference pill. */
  qtyTextBordered: {
    color: ADD_GREEN,
    fontSize: 16,
    fontWeight: "900",
    minWidth: 22,
    textAlign: "center",
    includeFontPadding: false,
  },
  qtyTextOnCurve: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800",
    minWidth: 22,
    textAlign: "center",
  },
  addBtnCompactDisabled: {
    backgroundColor: "#F3F4F6",
    borderColor: "#D1D5DB",
  },
  addPlusGlyphCompact: {
    fontSize: 24,
    fontWeight: "900",
    color: ADD_GREEN,
    lineHeight: 26,
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
  addBtnTextSoldOut: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  qtyWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 2.5,
    borderColor: ADD_GREEN,
    borderRadius: CONTROL_RADIUS,
    height: MENU_STEPPER_CONTROL_HEIGHT,
    width: "100%",
    // Visible so edge hitSlop around the border still receives taps.
    overflow: "visible",
    paddingHorizontal: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: {
        elevation: 0,
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
    borderRadius: MENU_STEPPER_RADIUS,
    minWidth: 96,
    width: "100%",
    borderWidth: 2.5,
    backgroundColor: "#FFFFFF",
    zIndex: 6,
    overflow: "visible",
  },
  qtyWrapCircle: {
    height: MENU_CIRCLE_CONTROL_SIZE,
    borderRadius: MENU_STEPPER_RADIUS,
    minWidth: 0,
    width: "100%",
    alignSelf: "stretch",
    borderWidth: 3,
    backgroundColor: "#FFFFFF",
    overflow: "visible",
  },
  qtyVisualRowCompact: {
    paddingHorizontal: 14,
  },
  qtyGlyphCompact: {
    fontSize: 20,
    lineHeight: 22,
    minWidth: 14,
    fontWeight: "900",
  },
  qtyTextCompact: {
    fontSize: 14,
    minWidth: 18,
    fontWeight: "900",
  },
  /** Always horizontal: −  qty  + */
  qtyVisualRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 1,
  },
  qtyGlyph: {
    fontSize: 20,
    fontWeight: "900",
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
    fontWeight: "900",
    color: ADD_GREEN,
    letterSpacing: 0.2,
    includeFontPadding: false,
    minWidth: 28,
  },
  qtyTextDisabled: {
    color: "#9CA3AF",
  },
});
