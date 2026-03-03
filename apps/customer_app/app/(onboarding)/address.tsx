/**
 * Onboarding – Add delivery location (Swiggy/Zomato-style).
 * Optional step: add first address or skip, then continue to permissions.
 */

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const BG = "#F8FAFC";
const CARD_BG = "#FFFFFF";
const ACCENT = "#0D9488";
const ACCENT_LIGHT = "#CCFBF1";
const TITLE = "#0F172A";
const BODY = "#475569";
const BORDER = "#E2E8F0";

export default function OnboardingAddressScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleAddAddress = () => {
    router.push({ pathname: "/location", params: { fromOnboarding: "1" } });
  };

  const handleSkip = () => {
    router.replace("/(onboarding)/permissions");
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={48} color={ACCENT} />
        </View>
        <Text style={styles.title}>Where do you want your orders delivered?</Text>
        <Text style={styles.subtitle}>
          Add your delivery location so we can show you nearby restaurants and accurate delivery times. You can add more
          addresses later.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={handleAddAddress} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.primaryBtnText}>Add delivery address</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.85}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: ACCENT_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: TITLE,
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: BODY,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    marginBottom: 14,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  skipBtn: {
    paddingVertical: 12,
  },
  skipBtnText: {
    color: BODY,
    fontSize: 15,
    fontWeight: "500",
  },
});
