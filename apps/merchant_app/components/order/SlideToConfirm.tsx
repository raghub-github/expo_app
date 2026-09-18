import { useEffect, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Vibration,
  Text as NativeText,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  claimHorizontalGesture,
  releaseHorizontalGesture,
} from "@/lib/horizontalGestureLock";
import { MerchantFonts } from "@/constants/theme";

/** Match IncomingOrderModal accept slider (lime track + dark thumb). */
const SLIDE_TRACK_H = 66;
const SLIDE_THUMB_W = 64;
const SLIDE_THUMB_H = 52;
const SLIDE_PAD = 7;
const SLIDE_ACTION_GREEN = "#7CFF2E";
const SLIDE_ACTION_GREEN_BORDER = "#111111";
const SLIDE_ACTION_LABEL = "#0B1A0F";
const SLIDE_ACTION_THUMB_BG = "#0B1220";
const SLIDE_ACTION_THUMB_ICON = "#FFFFFF";

const SLIDER_STAGE_COLORS: Record<
  "created" | "preparing" | "ready" | "picked_up",
  { track: string; border: string; label: string; thumb: string; icon: string }
> = {
  created: {
    track: SLIDE_ACTION_GREEN,
    border: SLIDE_ACTION_GREEN_BORDER,
    label: SLIDE_ACTION_LABEL,
    thumb: SLIDE_ACTION_THUMB_BG,
    icon: SLIDE_ACTION_THUMB_ICON,
  },
  preparing: {
    track: "#FACC15",
    border: "#854D0E",
    label: "#422006",
    thumb: "#0B1220",
    icon: "#FFFFFF",
  },
  ready: {
    track: "#2DD4BF",
    border: "#0F766E",
    label: "#042F2E",
    thumb: "#0B1220",
    icon: "#FFFFFF",
  },
  picked_up: {
    track: "#A78BFA",
    border: "#5B21B6",
    label: "#2E1065",
    thumb: "#0B1220",
    icon: "#FFFFFF",
  },
};
const SLIDER_DISABLED_BG = "#E5E7EB";
const SLIDER_URGENT = {
  track: "#EF4444",
  border: "#7F1D1D",
  label: "#FFFFFF",
  thumb: "#0B1220",
  icon: "#FFFFFF",
};

type SliderStage = "created" | "preparing" | "ready" | "picked_up";

export function SlideToConfirm({
  label,
  onConfirmed,
  disabled,
  stage = "created",
  compact = false,
  urgent = false,
}: {
  label: string;
  onConfirmed: () => void;
  disabled?: boolean;
  stage?: SliderStage;
  /** Narrow footer row (e.g. 70% accept beside reject). */
  compact?: boolean;
  /** <2 min left — red track (still slideable unless disabled). */
  urgent?: boolean;
}) {
  const trackWidth = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);
  const pulseScale = useRef(new Animated.Value(1)).current;
  const colors = urgent ? SLIDER_URGENT : SLIDER_STAGE_COLORS[stage];
  const trackH = compact ? 58 : SLIDE_TRACK_H;
  const thumbW = compact ? 52 : SLIDE_THUMB_W;
  const thumbH = compact ? 46 : SLIDE_THUMB_H;
  const pad = compact ? 6 : SLIDE_PAD;

  useEffect(() => {
    if (disabled) {
      pulseScale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.012,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [disabled, pulseScale]);

  const claimedRef = useRef(false);

  const claimGesture = useCallback(() => {
    if (claimedRef.current) return;
    claimedRef.current = true;
    claimHorizontalGesture();
  }, []);

  const releaseGesture = useCallback(() => {
    if (!claimedRef.current) return;
    claimedRef.current = false;
    releaseHorizontalGesture();
  }, []);

  // Confirming removes this card from the board, so the release event can never
  // arrive — without this the claim leaks and stage swiping stays dead.
  useEffect(() => releaseGesture, [releaseGesture]);

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

  const maxTravel = () => Math.max(0, trackWidth.current - thumbW - pad * 2);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_, gesture) =>
        !disabled && Math.abs(gesture.dx) > 4,
      onPanResponderGrant: () => {
        claimGesture();
      },
      onPanResponderMove: (_, gesture) => {
        if (disabled) return;
        const max = maxTravel();
        const next = Math.min(max, Math.max(0, gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        releaseGesture();
        if (disabled) {
          reset();
          return;
        }
        const max = maxTravel();
        const threshold = max * 0.85;
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
        releaseGesture();
        reset();
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ scale: pulseScale }] }]}>
      <View
        style={[
          styles.sliderTrack,
          { height: trackH, borderRadius: trackH / 2 },
          !disabled && { backgroundColor: colors.track, borderColor: colors.border },
          disabled && urgent && styles.sliderTrackUrgentDisabled,
          disabled && !urgent && styles.sliderTrackDisabled,
        ]}
        onLayout={(e) => {
          trackWidth.current = e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        <NativeText
          style={[
            styles.sliderLabel,
            {
              color: disabled && !urgent ? "#6B7280" : urgent ? (disabled ? "#7F1D1D" : colors.label) : colors.label,
              fontFamily: MerchantFonts.poppinsBold,
              fontSize: compact ? 13 : 16,
              paddingLeft: thumbW + (compact ? 8 : 14),
              paddingRight: compact ? 8 : 14,
            },
          ]}
          numberOfLines={1}
          allowFontScaling={false}
          pointerEvents="none"
        >
          {label}
        </NativeText>
        <Animated.View
          style={[
            styles.sliderKnob,
            {
              left: pad,
              top: (trackH - thumbH) / 2,
              width: thumbW,
              height: thumbH,
              borderRadius: thumbH / 2,
            },
            !disabled && { backgroundColor: colors.thumb },
            disabled && styles.sliderKnobDisabled,
            { transform: [{ translateX }] },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="chevron-forward" size={compact ? 18 : 22} color={disabled ? "#FFFFFF" : colors.icon} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "92%",
    alignSelf: "center",
  },
  sliderTrack: {
    height: SLIDE_TRACK_H,
    borderRadius: SLIDE_TRACK_H / 2,
    borderWidth: 1.5,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
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
  sliderTrackDisabled: {
    backgroundColor: SLIDER_DISABLED_BG,
    borderColor: "#D1D5DB",
  },
  sliderTrackUrgentDisabled: {
    backgroundColor: "#FECACA",
    borderColor: "#F87171",
  },
  sliderLabel: {
    width: "100%",
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.2,
    paddingLeft: SLIDE_THUMB_W + 14,
    paddingRight: 14,
    zIndex: 1,
  },
  sliderKnob: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  sliderKnobDisabled: {
    backgroundColor: "#9CA3AF",
  },
});
