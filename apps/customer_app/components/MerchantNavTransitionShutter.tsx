import { useLayoutEffect, useState } from "react";
import { Modal, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { MerchantMenuLoadingSkeleton } from "@/components/merchant/MerchantMenuLoadingSkeleton";
import { useMerchantNavTransitionStore } from "@/store/merchantNavTransitionStore";

/** Zomato-style slide-in duration — skeleton enters from the right edge. */
export const MERCHANT_NAV_SHUTTER_SLIDE_MS = 280;

/**
 * Full-screen merchant skeleton shutter on store-card tap.
 * Uses Modal so it renders above the native stack (sibling overlays sit underneath).
 */
export function MerchantNavTransitionShutter() {
  const { width } = useWindowDimensions();
  const active = useMerchantNavTransitionStore((s) => s.active);
  const merchantId = useMerchantNavTransitionStore((s) => s.merchantId);
  const loadingMessageIndex = useMerchantNavTransitionStore((s) => s.loadingMessageIndex);
  const [mounted, setMounted] = useState(false);
  const translateX = useSharedValue(width);

  useLayoutEffect(() => {
    if (active) {
      setMounted(true);
      translateX.value = width;
      translateX.value = withTiming(0, {
        duration: MERCHANT_NAV_SHUTTER_SLIDE_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    // Instant dismiss — store page is ready underneath; slide-out exposed a white gap.
    setMounted(false);
  }, [active, translateX, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!mounted) return null;

  return (
    <Modal
      visible
      animationType="none"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => useMerchantNavTransitionStore.getState().hide()}
    >
      <Animated.View style={[styles.layer, animatedStyle]}>
        <MerchantMenuLoadingSkeleton
          merchantId={merchantId ?? undefined}
          startMessageIndex={loadingMessageIndex}
          edgeToEdge
        />
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
