import { Platform, StyleSheet, useColorScheme, View } from "react-native";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { resolveAndroidSystemNavBackground } from "@/constants/layout";

/**
 * Paints the Android system navigation inset with the device theme color
 * (white in light mode, black in dark). pointerEvents none so Back/Home/Recents
 * stay tappable. Height is 0 on gesture nav.
 */
export function AndroidSystemNavigationFill() {
  const { bottom } = useAppSafeAreaInsets();
  const colorScheme = useColorScheme();
  if (Platform.OS !== "android" || bottom <= 0) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.fill,
        {
          height: bottom,
          backgroundColor: resolveAndroidSystemNavBackground(colorScheme),
        },
      ]}
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
    zIndex: 100000,
    elevation: 100000,
  },
});
