import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Vibration,
  PanResponder,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { colors } from "@/src/theme";
import {
  SLIDE_ACTION_GREEN,
  SLIDE_ACTION_GREEN_BORDER,
  SLIDE_ACTION_LABEL,
  SLIDE_ACTION_THUMB_BG,
  SLIDE_ACTION_THUMB_ICON,
  SLIDE_PAD,
  SLIDE_SIDE_INSET,
  SLIDE_THUMB_H,
  SLIDE_THUMB_W,
  SLIDE_TRACK_H,
} from "@/src/theme/slideAction";
import { SLIDE_COMPLETE_RATIO } from "@/src/lib/slideCompleteThreshold";
import { beginSlideAction, markSlideAction } from "@/src/lib/slideActionLatency";

const TRACK_H = SLIDE_TRACK_H;
const THUMB_W = SLIDE_THUMB_W;
const THUMB_H = SLIDE_THUMB_H;
const PAD = SLIDE_PAD;

const SNAP_SPRING = { damping: 22, stiffness: 210, mass: 0.75 };
const RESET_SPRING = { damping: 20, stiffness: 240, mass: 0.7 };

export type RiderActionSliderProps = {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
  locked?: boolean;
  busyLabel?: string | null;
  completed?: boolean;
  completedLabel?: string;
  geoLocked?: boolean;
  geoHint?: string | null;
  flushBottom?: boolean;
  safeAreaBottom?: number;
  actionName?: string;
  variant?: "default" | "urgent";
  resetKey?: string | number;
  style?: StyleProp<ViewStyle>;
  sideInset?: number;
  hapticOnComplete?: boolean;
};

/**
 * Single source of truth for rider slide-to-confirm CTAs.
 * Thumb position is a Reanimated shared value (no per-frame React state).
 */
export const RiderActionSlider = memo(function RiderActionSlider({
  label,
  onComplete,
  disabled = false,
  loading = false,
  locked = false,
  busyLabel = null,
  completed = false,
  completedLabel = "Done ✓",
  geoLocked = false,
  geoHint = null,
  flushBottom = false,
  safeAreaBottom = 0,
  actionName = "slide",
  variant = "default",
  resetKey = 0,
  style,
  sideInset = SLIDE_SIDE_INSET,
  hapticOnComplete = true,
}: RiderActionSliderProps) {
  const parentBusy = loading || locked;
  const ignoreGestures = disabled || parentBusy || geoLocked || completed;
  const showHintSlot = geoLocked && Boolean(geoHint);
  const urgent = variant === "urgent";

  const trackWidthRef = useRef(0);
  const translateX = useSharedValue(0);
  const firedSv = useSharedValue(0);
  const arrowPulse = useSharedValue(1);
  const idleHint = useSharedValue(0);
  const isDragging = useSharedValue(0);

  const firedJsRef = useRef(false);
  const prevBusyRef = useRef(parentBusy);
  const ignoreRef = useRef(ignoreGestures);
  ignoreRef.current = ignoreGestures;
  const parentBusyRef = useRef(parentBusy);
  parentBusyRef.current = parentBusy;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const actionNameRef = useRef(actionName);
  actionNameRef.current = actionName;
  const hapticRef = useRef(hapticOnComplete);
  hapticRef.current = hapticOnComplete;

  const trackBg = urgent ? "#EF4444" : SLIDE_ACTION_GREEN;
  const trackBorder = urgent ? "#7F1D1D" : SLIDE_ACTION_GREEN_BORDER;
  const labelColor = urgent ? "#FFFFFF" : SLIDE_ACTION_LABEL;
  const thumbBg = SLIDE_ACTION_THUMB_BG;
  const thumbIcon = SLIDE_ACTION_THUMB_ICON;

  const maxDrag = () => Math.max(0, trackWidthRef.current - THUMB_W - PAD * 2);

  const fireComplete = useCallback(() => {
    if (firedJsRef.current) return;
    firedJsRef.current = true;
    firedSv.value = 1;
    beginSlideAction(actionNameRef.current);
    markSlideAction("T1_HANDLER");
    if (hapticRef.current) {
      try {
        Vibration.vibrate(15);
      } catch {
        // ignore
      }
    }
    onCompleteRef.current();
  }, [firedSv]);

  const resetToStart = useCallback(() => {
    firedJsRef.current = false;
    firedSv.value = 0;
    isDragging.value = 0;
    translateX.value = withSpring(0, RESET_SPRING);
  }, [firedSv, isDragging, translateX]);

  useEffect(() => {
    resetToStart();
  }, [resetKey, resetToStart]);

  useEffect(() => {
    if (ignoreGestures) {
      arrowPulse.value = 1;
      idleHint.value = 0;
      return;
    }
    arrowPulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    idleHint.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [arrowPulse, idleHint, ignoreGestures]);

  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = parentBusy;
    if (completed) return;
    if (parentBusy) {
      firedJsRef.current = true;
      firedSv.value = 1;
      const max = maxDrag();
      if (max > 0) translateX.value = withSpring(max, SNAP_SPRING);
      return;
    }
    if (wasBusy && !parentBusy) {
      resetToStart();
    }
  }, [parentBusy, completed, firedSv, translateX, resetToStart]);

  const tryComplete = useCallback(
    (dx: number) => {
      if (firedJsRef.current) {
        const max = maxDrag();
        if (max > 0) translateX.value = withSpring(max, SNAP_SPRING);
        return true;
      }
      const max = maxDrag();
      if (dx < max * SLIDE_COMPLETE_RATIO) return false;
      const end = max > 0 ? max : dx;
      translateX.value = withSpring(end, SNAP_SPRING);
      fireComplete();
      return true;
    },
    [fireComplete, translateX]
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !ignoreRef.current,
        onMoveShouldSetPanResponder: (_, g) =>
          !ignoreRef.current && Math.abs(g.dx) > 2 && Math.abs(g.dx) > Math.abs(g.dy),
        onStartShouldSetPanResponderCapture: () => !ignoreRef.current,
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !ignoreRef.current && Math.abs(g.dx) > 2 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          if (firedJsRef.current && !parentBusyRef.current) {
            firedJsRef.current = false;
            firedSv.value = 0;
            translateX.value = 0;
          }
          isDragging.value = 1;
        },
        onPanResponderMove: (_, g) => {
          if (firedJsRef.current) return;
          const max = maxDrag();
          translateX.value = Math.max(0, Math.min(g.dx, max));
        },
        onPanResponderRelease: (_, g) => {
          isDragging.value = 0;
          if (!tryComplete(g.dx)) {
            translateX.value = withSpring(0, RESET_SPRING);
          }
        },
        onPanResponderTerminate: () => {
          isDragging.value = 0;
          if (!firedJsRef.current) {
            translateX.value = withSpring(0, RESET_SPRING);
          }
        },
      }),
    [firedSv, isDragging, translateX, tryComplete]
  );

  const thumbStyle = useAnimatedStyle(() => {
    const hint =
      isDragging.value || translateX.value > 2 || firedSv.value ? 0 : idleHint.value;
    return {
      transform: [{ translateX: translateX.value + hint }],
    };
  });

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: arrowPulse.value }],
  }));

  const trackShape =
    flushBottom && safeAreaBottom > 0
      ? { paddingBottom: safeAreaBottom, height: TRACK_H + safeAreaBottom }
      : undefined;

  if (completed) {
    return (
      <View style={[styles.wrap, { paddingHorizontal: sideInset }, flushBottom && styles.wrapFlush, style]}>
        <View
          style={[styles.doneTrack, { backgroundColor: trackBg, borderColor: trackBorder }, trackShape]}
        >
          <Ionicons name="checkmark-circle" size={22} color={labelColor} />
          <Text style={[styles.doneText, { color: labelColor }]}>{completedLabel}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingHorizontal: sideInset }, flushBottom && styles.wrapFlush, style]}>
      {showHintSlot ? (
        <View style={styles.geoHintSlot}>
          <Text style={styles.geoHint} numberOfLines={3}>
            {geoHint}
          </Text>
        </View>
      ) : null}
      <View
        style={[
          styles.track,
          { backgroundColor: trackBg, borderColor: trackBorder },
          trackShape,
          (disabled || geoLocked) && !locked && styles.trackDisabled,
          geoLocked && !loading && !locked && styles.trackGeoLocked,
        ]}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <Text
          style={[
            styles.label,
            { color: labelColor },
            flushBottom && safeAreaBottom > 0 ? { marginBottom: safeAreaBottom } : null,
            geoLocked ? styles.labelLocked : null,
          ]}
          pointerEvents="none"
          numberOfLines={1}
        >
          {parentBusy && busyLabel ? busyLabel : label}
        </Text>
        <View
          style={[
            styles.thumbZone,
            flushBottom && safeAreaBottom > 0 ? { bottom: safeAreaBottom } : null,
          ]}
          pointerEvents="none"
        >
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: thumbBg },
              geoLocked && styles.thumbLocked,
              thumbStyle,
            ]}
          >
            {loading || locked ? (
              <ActivityIndicator color={thumbIcon} size="small" />
            ) : geoLocked ? (
              <Ionicons name="lock-closed" size={18} color={colors.gray[600]} />
            ) : (
              <Animated.View style={arrowStyle}>
                <Ionicons name="arrow-forward" size={22} color={thumbIcon} />
              </Animated.View>
            )}
          </Animated.View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 2,
  },
  wrapFlush: {
    marginTop: 0,
  },
  geoHintSlot: {
    justifyContent: "center",
    marginBottom: 6,
  },
  geoHint: {
    fontSize: 13,
    color: colors.gray[600],
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  trackDisabled: {
    opacity: 0.65,
  },
  trackGeoLocked: {
    backgroundColor: colors.gray[300],
    borderColor: colors.gray[500],
    opacity: 1,
  },
  thumbZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: THUMB_W + PAD * 2 + 20,
    justifyContent: "center",
    zIndex: 2,
    pointerEvents: "none",
  },
  thumb: {
    marginLeft: PAD,
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: THUMB_H / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbLocked: {
    backgroundColor: colors.gray[600],
  },
  label: {
    width: "100%",
    textAlign: "center",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 0.3,
    paddingHorizontal: THUMB_W + 18,
    zIndex: 1,
  },
  labelLocked: {
    color: colors.gray[700],
  },
  doneTrack: {
    height: TRACK_H,
    minHeight: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneText: {
    fontSize: 18,
    fontWeight: "900",
  },
});
