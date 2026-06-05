import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export default function RideSearchingScreenWeb() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Ionicons name="phone-portrait-outline" size={64} color="#6B7280" />
        <Text style={styles.title}>Ride search on mobile</Text>
        <Text style={styles.subtitle}>
          Please use the mobile app to search for a rider.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#111827", textAlign: "center" },
  subtitle: { fontSize: 15, color: "#6B7280", textAlign: "center", lineHeight: 22 },
  backButton: {
    marginTop: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 24,
  },
  backButtonText: { fontSize: 16, fontWeight: "700", color: "#111827" },
});
