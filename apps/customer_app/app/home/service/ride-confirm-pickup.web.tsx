import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export default function RideConfirmPickupScreenWeb() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        <Ionicons name="phone-portrait-outline" size={64} color="#6B7280" />
        <AppText style={styles.title}>Confirm pickup on mobile</AppText>
        <AppText style={styles.subtitle}>
          Please use the mobile app to confirm your pickup point on the map.
        </AppText>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <AppText style={styles.backButtonText}>Go back</AppText>
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
