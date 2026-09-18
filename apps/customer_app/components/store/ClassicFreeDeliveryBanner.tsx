/**
 * Classic merchant — thin mint free-delivery ribbon under filter pills.
 */

import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  label?: string;
};

export function ClassicFreeDeliveryBanner({
  label = "Free delivery with GM Plus upto 5km.",
}: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="text">
      <View style={styles.ribbon}>
        <Ionicons name="bicycle" size={16} color="#FFFFFF" />
        <AppText style={styles.text} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  ribbon: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GatiMitraColors.deepMintStart,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
});
