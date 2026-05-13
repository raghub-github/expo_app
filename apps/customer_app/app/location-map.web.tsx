import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const CARD_BG = "#FFFFFF";

export default function LocationMapScreenWeb() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm location</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.body}>
        <Ionicons name="phone-portrait-outline" size={64} color={TEXT_GRAY} />
        <Text style={styles.title}>Map not available on web</Text>
        <Text style={styles.subtitle}>
          Please use the mobile app to select your location on the map.
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK },
  headerRight: { width: 36 },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  title: { fontSize: 20, fontWeight: "700", color: TITLE_DARK, textAlign: "center" },
  subtitle: { fontSize: 15, color: TEXT_GRAY, textAlign: "center", lineHeight: 22 },
  backButton: {
    marginTop: 8,
    backgroundColor: TEAL,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  backButtonText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
