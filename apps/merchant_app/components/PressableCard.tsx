/**
 * Card with press feedback (opacity + optional scale). No overflow.
 */

import { Pressable, ViewStyle, StyleSheet, Platform } from "react-native";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

export function PressableCard({
  children,
  onPress,
  style,
  noShadow,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  noShadow?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        !noShadow && GatiMitraMerchant.shadowCard,
        pressed && styles.pressed,
        GatiMitraMerchant.cursorPointer,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  pressed: {
    opacity: Platform.OS === "ios" ? 0.92 : 0.95,
    transform: [{ scale: 0.98 }],
  },
});
