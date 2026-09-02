import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CUSTOMER_SYSTEM_NAV_MINT } from "@/constants/layout";

/**
 * Paints the Android system navigation bar zone mint-green on 3-button nav devices.
 * Uses live WindowInsets (safe-area bottom) — height is 0 on gesture nav, so no
 * artificial strip is added. pointerEvents none so Back/Home/Recents stay tappable.
 */
export function AndroidSystemNavigationFill() {
  const { bottom } = useSafeAreaInsets();
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
    backgroundColor: CUSTOMER_SYSTEM_NAV_MINT,
    zIndex: 0,
  },
});
