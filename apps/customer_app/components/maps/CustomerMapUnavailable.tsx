import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  message?: string;
  style?: object;
};

export function CustomerMapUnavailable({
  message = "Map unavailable — add EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN",
  style,
}: Props) {
  return (
    <View style={[styles.root, style]}>
      <Ionicons name="map-outline" size={32} color="#9CA3AF" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 10,
  },
  text: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
});
