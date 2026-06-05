import { useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const SLIDER_STAGE_COLORS: Record<
  "created" | "preparing" | "ready" | "picked_up",
  { track: string; knob: string }
> = {
  created: { track: "#22C55E", knob: "#16A34A" },
  preparing: { track: "#CA8A04", knob: "#A16207" },
  ready: { track: "#0D9488", knob: "#0F766E" },
  picked_up: { track: "#7C3AED", knob: "#5B21B6" },
};
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_LABEL_TEXT = "#FFFFFF";

type SliderStage = "created" | "preparing" | "ready" | "picked_up";

export function SlideToConfirm({
  label,
  onConfirmed,
  disabled,
  stage = "created",
}: {
  label: string;
  onConfirmed: () => void;
  disabled?: boolean;
  stage?: SliderStage;
}) {
  const trackWidth = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);
  const pulseOpacity = useRef(new Animated.Value(1)).current;
  const colors = SLIDER_STAGE_COLORS[stage];

  useEffect(() => {
    if (disabled) {
      pulseOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 0.88,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, pulseOpacity]);

  const reset = useCallback(() => {
    confirmedRef.current = false;
    Animated.timing(translateX, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const handleConfirm = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    Vibration.vibrate(15);
    onConfirmed();
    setTimeout(reset, 260);
  }, [onConfirmed, reset]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled && Math.abs(gesture.dx) > 6,
      onPanResponderMove: (_, gesture) => {
        if (disabled) return;
        const max = Math.max(0, trackWidth.current - 46);
        const next = Math.min(max, Math.max(0, gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        if (disabled) {
          reset();
          return;
        }
        const max = Math.max(0, trackWidth.current - 46);
        const threshold = max * 0.7;
        if (gesture.dx >= threshold) {
          Animated.timing(translateX, {
            toValue: max,
            duration: 140,
            useNativeDriver: true,
          }).start(handleConfirm);
        } else {
          reset();
        }
      },
      onPanResponderTerminate: () => {
        reset();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.sliderTrack,
        !disabled && { backgroundColor: colors.track },
        disabled && styles.sliderTrackDisabled,
        !disabled && { opacity: pulseOpacity },
      ]}
      onLayout={(e) => {
        trackWidth.current = e.nativeEvent.layout.width;
      }}
    >
      <Text
        style={[styles.sliderLabel, disabled && styles.sliderLabelDisabled]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Animated.View
        style={[
          styles.sliderKnob,
          !disabled && { backgroundColor: colors.knob },
          { transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
      >
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sliderTrack: {
    height: 48,
    borderRadius: 999,
    justifyContent: "center",
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  sliderTrackDisabled: { backgroundColor: SLIDER_DISABLED_BG },
  sliderLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    color: SLIDER_LABEL_TEXT,
    textShadowColor: "rgba(0,0,0,0.25)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  sliderLabelDisabled: { opacity: 0.8 },
  sliderKnob: {
    width: 40,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
});
