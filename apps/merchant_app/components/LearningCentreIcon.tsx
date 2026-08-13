import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";

/** Lightbulb with a lightning bolt — Learning centre tile icon (light mode). */
export function LearningCentreIcon({
  size = 26,
  color = GatiMitraMerchant.textPrimary,
}: {
  size?: number;
  color?: string;
}) {
  const bolt = Math.round(size * 0.42);
  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessibilityElementsHidden>
      <Ionicons name="bulb-outline" size={size} color={color} />
      <Ionicons
        name="flash"
        size={bolt}
        color={color}
        style={[styles.bolt, { top: size * 0.32 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  bolt: {
    position: "absolute",
  },
});
