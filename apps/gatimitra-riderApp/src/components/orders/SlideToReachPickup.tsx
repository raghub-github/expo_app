import React, { useMemo, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { colors } from "@/src/theme";

const TRACK_H = 58;
const THUMB = 48;
const PAD = 5;
const SLIDE_COMPLETE_RATIO = 0.15;
const SLIDE_COMPLETE_MIN_PX = 22;

type Props = {
  title: string;
  subtitle: string;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
  completed?: boolean;
  completedLabel?: string;
};

export function SlideToReachPickup({
  title,
  subtitle,
  onComplete,
  disabled = false,
  loading = false,
  completed = false,
  completedLabel = "Reached pickup ✓",
}: Props) {
  const trackWidthRef = useRef(0);
  const translateX = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const shimmerX = useSharedValue(-120);
  const chevronScale = useSharedValue(1);
  const bikeBounce = useSharedValue(0);
  const firedRef = useRef(false);

  const maxDrag = () => Math.max(0, trackWidthRef.current - THUMB - PAD * 2);

  const slideThreshold = (max: number) =>
    max > 0 ? Math.max(SLIDE_COMPLETE_MIN_PX, max * SLIDE_COMPLETE_RATIO) : SLIDE_COMPLETE_MIN_PX;

  const tryCompleteSlide = (dx: number) => {
    const max = maxDrag();
    if (dx < slideThreshold(max)) return false;
    if (max > 0) {
      translateX.value = withSpring(max, { damping: 20, stiffness: 240 });
    }
    isDragging.value = false;
    if (!firedRef.current) {
      firedRef.current = true;
      onComplete();
    }
    return true;
  };

  useEffect(() => {
    if (disabled || loading || completed) return;

    shimmerX.value = withRepeat(
      withTiming(400, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );

    chevronScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    bikeBounce.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 700, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [bikeBounce, chevronScale, completed, disabled, loading, shimmerX]);

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
        onStartShouldSetPanResponder: () => !disabled && !loading && !completed,
        onMoveShouldSetPanResponder: (_, g) =>
          !disabled && !loading && !completed && Math.abs(g.dx) > 4,
        onPanResponderGrant: () => {
          isDragging.value = true;
        },
        onPanResponderMove: (_, g) => {
          const max = maxDrag();
          translateX.value = Math.max(0, Math.min(g.dx, max));
          tryCompleteSlide(g.dx);
        },
        onPanResponderRelease: (_, g) => {
          if (!tryCompleteSlide(g.dx)) {
            resetThumb();
          }
        },
        onPanResponderTerminate: () => {
          resetThumb();
        },
      }),
    [completed, disabled, loading, onComplete, translateX, isDragging]
  );

  const idleHint = useSharedValue(0);

  useEffect(() => {
    if (disabled || loading || completed) return;
    idleHint.value = withRepeat(
      withSequence(
        withTiming(10, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 850, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [completed, disabled, idleHint, loading]);

  const thumbStyle = useAnimatedStyle(() => {
    const hint = isDragging.value || translateX.value > 2 ? 0 : idleHint.value;
    return {
      transform: [{ translateX: translateX.value + hint }],
    };
  });

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value }, { skewX: "-18deg" }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ scale: chevronScale.value }],
  }));

  const bikeStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bikeBounce.value }],
  }));

  if (completed) {
    return (
      <View style={styles.doneTrack}>
        <LinearGradient
          colors={[colors.success[600], colors.success[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.doneGradient}
        >
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.doneText}>{completedLabel}</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View
      style={[styles.track, (disabled || loading) && styles.trackDisabled]}
      onLayout={(e) => {
        trackWidthRef.current = e.nativeEvent.layout.width;
      }}
      {...(disabled || loading ? {} : pan.panHandlers)}
    >
      <LinearGradient
        colors={[colors.primary[700], colors.primary[500], colors.primary[400]]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradient}
      >
        <Animated.View style={[styles.shimmer, shimmerStyle]} pointerEvents="none" />

        <View style={styles.labelCol} pointerEvents="none">
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        <View style={styles.thumbHit} pointerEvents="none" accessibilityRole="adjustable">
          <Animated.View style={[styles.thumb, thumbStyle]}>
            {loading ? (
              <ActivityIndicator color={colors.primary[700]} />
            ) : (
              <Animated.View style={chevronStyle}>
                <Ionicons name="chevron-forward" size={22} color={colors.primary[700]} />
              </Animated.View>
            )}
          </Animated.View>
        </View>

        <Animated.View style={[styles.bikeWrap, bikeStyle]} pointerEvents="none">
          <Ionicons name="bicycle" size={26} color="rgba(255,255,255,0.9)" />
        </Animated.View>
      </LinearGradient>
    </View>
  );
}

const trackShadow = Platform.select({
  ios: {
    shadowColor: colors.primary[800],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
  },
  android: { elevation: 6 },
  default: {},
});

const styles = StyleSheet.create({
  track: {
    height: TRACK_H,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 10,
    ...trackShadow,
  },
  trackDisabled: {
    opacity: 0.65,
  },
  gradient: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: PAD + 4,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  labelCol: {
    flex: 1,
    paddingLeft: THUMB + 8,
    paddingRight: 36,
  },
  title: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  subtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
  },
  thumbHit: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: THUMB + PAD * 2 + 24,
    justifyContent: "center",
    zIndex: 2,
    pointerEvents: "none",
  },
  thumb: {
    marginLeft: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  bikeWrap: {
    position: "absolute",
    right: 16,
  },
  doneTrack: {
    height: TRACK_H,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 10,
  },
  doneGradient: {
    flex: 1,
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
