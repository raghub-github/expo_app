import { Platform, StyleSheet, View } from "react-native";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";

/**
 * Reserves the Android system-navigation inset without painting a solid "edge"
 * fill — gesture / 3-button chrome stays visible under floating tab + cart.
 * pointerEvents none so Back/Home/Recents stay tappable.
 */
export function AndroidSystemNavigationFill() {
  const { bottom } = useAppSafeAreaInsets();
  if (Platform.OS !== "android" || bottom <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.fill, { height: bottom }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // Transparent — do not cover the system gesture / nav row with a white strip.
    backgroundColor: "transparent",
    zIndex: 1,
    elevation: 0,
  },
});
