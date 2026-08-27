/**
 * Status pill slideshow for prep-delay: follow-up copy ↔ "STORE NEED X MIN MORE".
 */
import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated, Easing } from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";

const HOLD_MS = 3_200;
const WIPE_MS = 280;
const WIPE_PX = 14;

type Props = {
  followUpText: string;
  extraMinutes: number;
  light?: boolean;
  textColor?: string;
};

export function PrepDelayStatusPillSlideshow({
  followUpText,
  extraMinutes,
  light = false,
  textColor,
}: Props) {
  const mins = Math.max(1, Math.round(extraMinutes));
  const needMoreText = `STORE NEED ${mins} MIN MORE`;
  const [showNeedMore, setShowNeedMore] = useState(false);
  const wipeY = useRef(new Animated.Value(0)).current;
  const wipeOpacity = useRef(new Animated.Value(1)).current;
  const faceRef = useRef(false);
  faceRef.current = showNeedMore;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ease = Easing.out(Easing.cubic);

    const scheduleNext = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        Animated.parallel([
          Animated.timing(wipeY, {
            toValue: -WIPE_PX,
            duration: WIPE_MS,
            easing: ease,
            useNativeDriver: true,
          }),
          Animated.timing(wipeOpacity, {
            toValue: 0,
            duration: WIPE_MS,
            easing: ease,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (!finished || cancelled) return;
          setShowNeedMore(!faceRef.current);
          wipeY.setValue(WIPE_PX);
          wipeOpacity.setValue(0);
          Animated.parallel([
            Animated.timing(wipeY, {
              toValue: 0,
              duration: WIPE_MS,
              easing: ease,
              useNativeDriver: true,
            }),
            Animated.timing(wipeOpacity, {
              toValue: 1,
              duration: WIPE_MS,
              easing: ease,
              useNativeDriver: true,
            }),
          ]).start(({ finished: inDone }) => {
            if (inDone && !cancelled) scheduleNext();
          });
        });
      }, HOLD_MS);
    };

    scheduleNext();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      wipeY.stopAnimation();
      wipeOpacity.stopAnimation();
    };
  }, [wipeY, wipeOpacity, mins, followUpText]);

  const label = showNeedMore ? needMoreText : followUpText;
  const color = textColor ?? (light ? "#111827" : "#FFFFFF");

  return (
    <View style={styles.clip} accessibilityLiveRegion="polite">
      <Animated.View
        style={{
          opacity: wipeOpacity,
          transform: [{ translateY: wipeY }],
        }}
      >
        <CheckoutText style={[styles.text, { color }]} numberOfLines={2}>
          {label}
        </CheckoutText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
    justifyContent: "center",
    minHeight: 36,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
  },
});
