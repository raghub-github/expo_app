import React, { useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

const TRACK_H = 54;
const THUMB = 46;
const PAD = 4;
const SLIDE_GREEN = "#34A853";

type Props = {
  label: string;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
  completed?: boolean;
  completedLabel?: string;
  /** Geo-fence lock — action unavailable until rider is within configured radius. */
  geoLocked?: boolean;
  geoHint?: string | null;
  /** Flush to parent bottom — square bottom corners, no outer margin. */
  flushBottom?: boolean;
  /** Extends green track through the home-indicator safe area. */
  safeAreaBottom?: number;
};

export function FoodSlideToReachStore({
  label,
  onComplete,
  disabled = false,
  loading = false,
  completed = false,
  completedLabel = "Reached at store ✓",
  geoLocked = false,
  geoHint = null,
  flushBottom = false,
  safeAreaBottom = 0,
}: Props) {
  const actionDisabled = disabled || loading || geoLocked;
  const showHintSlot = geoLocked && Boolean(geoHint);
  const trackWidthRef = useRef(0);
  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const chevronPulse = useSharedValue(1);
  const firedRef = useRef(false);

  const maxDrag = () => Math.max(0, trackWidthRef.current - THUMB - PAD * 2);

  useEffect(() => {
    if (actionDisabled || completed) return;
    chevronPulse.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 500, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [chevronPulse, completed, actionDisabled]);

  useEffect(() => {
    if (!loading && !completed) {
      firedRef.current = false;
      isDragging.value = false;
      translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    }
  }, [loading, completed, translateX, isDragging]);

  const resetThumb = () => {
    isDragging.value = false;
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    firedRef.current = false;
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !actionDisabled && !completed,
        onMoveShouldSetPanResponder: () => !actionDisabled && !completed,
        onPanResponderGrant: () => {
          isDragging.value = true;
        },
        onPanResponderMove: (_, g) => {
          const max = maxDrag();
          translateX.value = Math.max(0, Math.min(g.dx, max));
        },
        onPanResponderRelease: () => {
          const max = maxDrag();
          if (max > 0 && translateX.value >= max * 0.72) {
            translateX.value = withSpring(max, { damping: 20, stiffness: 240 });
            isDragging.value = false;
            if (!firedRef.current) {
              firedRef.current = true;
              runOnJS(onComplete)();
            }
          } else {
            resetThumb();
          }
        },
        onPanResponderTerminate: resetThumb,
      }),
    [completed, actionDisabled, onComplete, translateX, isDragging]
  );

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ scale: chevronPulse.value }],
  }));

  const trackShape = flushBottom
    ? [
        styles.trackFlush,
        styles.trackFlushNoShadow,
        safeAreaBottom > 0 ? { paddingBottom: safeAreaBottom, height: 56 + safeAreaBottom } : { height: 56 },
      ]
    : undefined;
  const doneShape = flushBottom
    ? [
        styles.trackFlush,
        styles.trackFlushNoShadow,
        safeAreaBottom > 0 ? { paddingBottom: safeAreaBottom, height: 56 + safeAreaBottom } : { height: 56 },
      ]
    : undefined;

  if (completed) {
    return (
      <View style={[styles.doneTrack, doneShape]}>
        <Ionicons name="checkmark-circle" size={22} color="#fff" />
        <Text style={styles.doneText}>{completedLabel}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, flushBottom && styles.wrapFlush]}>
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
          trackShape,
          actionDisabled && !flushBottom && styles.trackDisabled,
          actionDisabled && flushBottom && styles.trackFlushDisabled,
          geoLocked && !loading && styles.trackGeoLocked,
        ]}
        onLayout={(e) => {
          trackWidthRef.current = e.nativeEvent.layout.width;
        }}
      >
        <View
          {...(actionDisabled ? {} : pan.panHandlers)}
          style={[
            styles.thumbZone,
            flushBottom && safeAreaBottom > 0 ? { bottom: safeAreaBottom } : null,
          ]}
        >
          <Animated.View style={[styles.thumb, thumbStyle]}>
            {loading ? (
              <ActivityIndicator color={SLIDE_GREEN} size="small" />
            ) : geoLocked ? (
              <Ionicons name="lock-closed" size={18} color={colors.gray[600]} />
            ) : (
              <Animated.View style={[styles.chevronPair, chevronStyle]}>
                <Ionicons name="chevron-forward" size={16} color={SLIDE_GREEN} />
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={SLIDE_GREEN}
                  style={styles.chevronSecond}
                />
              </Animated.View>
            )}
          </Animated.View>
        </View>
        <Text
          style={[
            styles.label,
            flushBottom && safeAreaBottom > 0 ? { marginBottom: safeAreaBottom } : null,
          ]}
          pointerEvents="none"
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    marginTop: 2,
  },
  wrapFlush: {
    marginTop: 0,
  },
  trackFlush: {
    borderRadius: 0,
    minHeight: 56,
  },
  trackFlushNoShadow: Platform.select({
    ios: {
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    android: { elevation: 0 },
    default: {},
  }),
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
    backgroundColor: SLIDE_GREEN,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: colors.success[800],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      default: {},
    }),
  },
  trackDisabled: {
    opacity: 0.65,
  },
  trackFlushDisabled: {
    backgroundColor: "#5F9E6E",
    opacity: 1,
  },
  trackGeoLocked: {
    backgroundColor: colors.gray[300],
    opacity: 1,
  },
  thumbZone: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: THUMB + PAD * 2 + 20,
    justifyContent: "center",
    zIndex: 2,
  },
  thumb: {
    marginLeft: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  chevronPair: {
    flexDirection: "row",
    alignItems: "center",
  },
  chevronSecond: {
    marginLeft: -10,
  },
  label: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
    paddingHorizontal: THUMB + 14,
  },
  doneTrack: {
    height: TRACK_H,
    minHeight: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: SLIDE_GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
