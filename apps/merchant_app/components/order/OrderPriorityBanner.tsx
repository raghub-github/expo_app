import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/** Zomato-style PRIORITY strip when rider free-wait has expired. */
export function OrderPriorityBanner() {
  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel="Priority order">
      <Ionicons name="diamond" size={14} color="#93C5FD" />
      <Text style={styles.label}>PRIORITY</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1E3A8A",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: "#FFFFFF",
  },
});
