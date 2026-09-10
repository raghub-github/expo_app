import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  /** Optional fixed line (e.g. veg-only). When unset, rotates Zomato-style quotes. */
  slogan?: string;
  dark?: boolean;
};

const LOADING_QUOTES = [
  "Creativity is 98% work and 2% coffee breaks",
  "Looking for great food near you",
  "Good food takes a moment — hang tight",
  "Finding the tastiest spots around you",
  "Hunger called. We're answering.",
  "Almost there — plating the best nearby",
] as const;

const ROTATE_MS = 3000;

/**
 * Header stays real; main area shows rotating slogan + spinner
 * instead of a blank white hole (Zomato-style).
 */
export function FoodHomeListingSkeleton({ slogan, dark = false }: Props) {
  const { height: windowHeight } = useWindowDimensions();
  const lines = useMemo(() => {
    if (slogan?.trim()) return [slogan.trim()];
    return [...LOADING_QUOTES];
  }, [slogan]);

  const [quoteIndex, setQuoteIndex] = useState(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    setQuoteIndex(0);
    opacity.value = 1;
  }, [lines, opacity]);

  useEffect(() => {
    if (lines.length < 2) return;

    const bump = () => {
      setQuoteIndex((i) => (i + 1) % lines.length);
      opacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.quad) });
    };

    const timer = setInterval(() => {
      opacity.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.quad) }, (ok) => {
        if (ok) runOnJS(bump)();
      });
    }, ROTATE_MS);

    return () => clearInterval(timer);
  }, [lines, opacity]);

  const textStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const text = lines[quoteIndex % lines.length] ?? LOADING_QUOTES[0];
  // Fill the list body so loading never reads as an empty white hole.
  const minHeight = Math.max(320, Math.round(windowHeight * 0.42));

  return (
    <View
      style={[styles.root, dark && styles.rootDark, { minHeight }]}
      accessibilityLabel="Loading restaurants"
    >
      <Animated.View style={[styles.sloganWrap, textStyle]}>
        <AppText style={[styles.slogan, dark && styles.sloganDark]}>{text}</AppText>
      </Animated.View>
      <ActivityIndicator
        size="large"
        color={dark ? "#86EFAC" : GatiMitraColors.primaryMint}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 72,
    paddingBottom: 80,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 36,
  },
  rootDark: {
    backgroundColor: "transparent",
  },
  sloganWrap: {
    minHeight: 56,
    justifyContent: "center",
    alignItems: "center",
  },
  slogan: {
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    color: "#94A3B8",
  },
  sloganDark: {
    color: "#94A3B8",
  },
  spinner: {
    marginTop: 18,
  },
});
