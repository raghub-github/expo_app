/**
 * Status pill slideshow for prep-delay: follow-up copy ↔ "STORE NEED X MIN MORE".
 * Width hugs the longer label (+ padding); labels slide inside (vertical wipe + marquee when capped).
 */
import { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  type TextStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { CheckoutText } from "@/components/checkout/CheckoutText";

const HOLD_MS = 3_200;
const WIPE_MS = 280;
const WIPE_PX = 14;
const PILL_HEIGHT = 34;
const PILL_H_PADDING = 28;
const SCREEN_W = Dimensions.get("window").width;
const MAX_PILL_WIDTH = SCREEN_W - 70;

type Props = {
  followUpText: string;
  extraMinutes: number;
  light?: boolean;
  textColor?: string;
  chipStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

function PillLabel({
  text,
  color,
  textStyle,
  containerWidth,
}: {
  text: string;
  color: string;
  textStyle?: StyleProp<TextStyle>;
  containerWidth: number;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const [textWidth, setTextWidth] = useState(0);
  const innerWidth = Math.max(0, containerWidth - PILL_H_PADDING);
  const shouldMarquee = innerWidth > 0 && textWidth > innerWidth + 2;

  useEffect(() => {
    loopRef.current?.stop();
    translateX.setValue(0);
    if (!shouldMarquee || textWidth <= 0) return;
    const duration = Math.max(5_000, Math.round(textWidth * 28));
    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(translateX, {
          toValue: -(textWidth - innerWidth + 16),
          duration,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(800),
        Animated.timing(translateX, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [text, textWidth, innerWidth, shouldMarquee, translateX]);

  return (
    <View
      style={[
        styles.labelClip,
        { width: innerWidth },
        shouldMarquee ? styles.labelClipMarquee : styles.labelClipCentered,
      ]}
    >
      <Animated.View
        style={[
          shouldMarquee ? styles.marqueeTrack : styles.centeredTrack,
          { transform: [{ translateX }] },
        ]}
      >
        <CheckoutText
          style={[styles.text, textStyle, { color }]}
          numberOfLines={1}
          ellipsizeMode="clip"
          onLayout={(e) => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            if (w > 0) setTextWidth(w);
          }}
        >
          {text}
        </CheckoutText>
      </Animated.View>
    </View>
  );
}

export function PrepDelayStatusPillSlideshow({
  followUpText,
  extraMinutes,
  light = false,
  textColor,
  chipStyle,
  textStyle,
}: Props) {
  const mins = Math.max(1, Math.round(extraMinutes));
  const needMoreText = `STORE NEED ${mins} MIN MORE`;
  const [showNeedMore, setShowNeedMore] = useState(false);
  const [labelWidths, setLabelWidths] = useState({ followUp: 0, needMore: 0 });
  const contentWidth = Math.max(labelWidths.followUp, labelWidths.needMore);
  const pillWidth =
    contentWidth > 0
      ? Math.min(contentWidth + PILL_H_PADDING, MAX_PILL_WIDTH)
      : 0;
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

  const textMeasureStyle = [styles.text, textStyle, { color }];

  return (
    <>
      <View style={styles.measureRow} pointerEvents="none" accessible={false}>
        <CheckoutText
          style={textMeasureStyle}
          numberOfLines={1}
          onLayout={(e) => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            if (w > 0) setLabelWidths((prev) => ({ ...prev, followUp: w }));
          }}
        >
          {followUpText}
        </CheckoutText>
        <CheckoutText
          style={textMeasureStyle}
          numberOfLines={1}
          onLayout={(e) => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            if (w > 0) setLabelWidths((prev) => ({ ...prev, needMore: w }));
          }}
        >
          {needMoreText}
        </CheckoutText>
      </View>
      <View
        style={[
          styles.pill,
          chipStyle,
          pillWidth > 0 ? { width: pillWidth } : styles.pillAuto,
        ]}
        accessibilityLiveRegion="polite"
      >
        <View style={styles.clip}>
          <Animated.View
            style={{
              opacity: wipeOpacity,
              transform: [{ translateY: wipeY }],
              width: "100%",
              alignItems: "center",
            }}
          >
            <PillLabel
              text={label}
              color={color}
              textStyle={textStyle}
              containerWidth={pillWidth > 0 ? pillWidth - PILL_H_PADDING : 160}
            />
          </Animated.View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  measureRow: {
    position: "absolute",
    opacity: 0,
    left: -9999,
    flexDirection: "row",
  },
  pill: {
    height: PILL_HEIGHT,
    maxHeight: PILL_HEIGHT,
    paddingHorizontal: 14,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    alignSelf: "center",
    flexShrink: 1,
  },
  pillAuto: {
    alignSelf: "center",
  },
  clip: {
    overflow: "hidden",
    justifyContent: "center",
    height: PILL_HEIGHT,
    maxHeight: PILL_HEIGHT,
    width: "100%",
    alignItems: "center",
  },
  labelClip: {
    overflow: "hidden",
  },
  labelClipCentered: {
    alignItems: "center",
  },
  labelClipMarquee: {
    alignItems: "flex-start",
  },
  centeredTrack: {
    alignItems: "center",
    justifyContent: "center",
  },
  marqueeTrack: {
    alignItems: "flex-start",
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
    textAlign: "center",
  },
});
