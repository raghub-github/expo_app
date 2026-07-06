import { useLayoutEffect, useState } from "react";
import { Modal, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MealsUnderPriceLoadingSkeleton } from "@/components/meals-under-price/MealsUnderPriceLoadingSkeleton";
import { useMealsUnderPriceNavTransitionStore } from "@/store/mealsUnderPriceNavTransitionStore";

export const MEALS_UNDER_PRICE_NAV_SHUTTER_SLIDE_MS = 280;

export function MealsUnderPriceNavTransitionShutter() {
  const { width } = useWindowDimensions();
  const active = useMealsUnderPriceNavTransitionStore((s) => s.active);
  const loadingMessageIndex = useMealsUnderPriceNavTransitionStore((s) => s.loadingMessageIndex);
  const [mounted, setMounted] = useState(false);
  const translateX = useSharedValue(width);

  useLayoutEffect(() => {
    if (active) {
      setMounted(true);
      translateX.value = width;
      translateX.value = withTiming(0, {
        duration: MEALS_UNDER_PRICE_NAV_SHUTTER_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }
    setMounted(false);
  }, [active, translateX, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal visible animationType="none" transparent={false} statusBarTranslucent onRequestClose={() => useMealsUnderPriceNavTransitionStore.getState().hide()}>
      <Animated.View style={[styles.layer, animatedStyle]}>
        <MealsUnderPriceLoadingSkeleton startMessageIndex={loadingMessageIndex} edgeToEdge />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
});
