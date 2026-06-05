import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function LocationSearchEmptyState() {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search-outline" size={40} color="#D1D5DB" />
      <Text style={styles.title}>No locations found</Text>
      <Text style={styles.sub}>
        Try searching with a landmark, area, or full address.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  sub: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
});
