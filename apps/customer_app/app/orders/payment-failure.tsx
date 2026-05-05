/**
 * Payment or order confirmation failed — clear next steps (retry checkout or view orders).
 */

import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const PAD = 20;

export default function PaymentFailureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { message: msgParam, title: titleParam } = useLocalSearchParams<{
    message?: string | string[];
    title?: string | string[];
  }>();
  const message = (Array.isArray(msgParam) ? msgParam[0] : msgParam) ?? "We could not confirm your payment or order.";
  const title = (Array.isArray(titleParam) ? titleParam[0] : titleParam) ?? "Payment issue";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle" size={56} color="#dc2626" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
      <Text style={styles.note}>
        If money was debited, it is usually refunded automatically within a few days. You can retry checkout or check My
        Orders for an order that may already exist.
      </Text>

      <TouchableOpacity
        style={styles.primary}
        onPress={() => router.replace("/checkout")}
        activeOpacity={0.88}
      >
        <Text style={styles.primaryText}>Try checkout again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondary}
        onPress={() => router.replace("/(tabs)/orders")}
        activeOpacity={0.88}
      >
        <Text style={styles.secondaryText}>My Orders</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.tertiary} onPress={() => router.replace("/(tabs)/")} activeOpacity={0.88}>
        <Text style={styles.tertiaryText}>Back to Home</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  content: { paddingHorizontal: PAD },
  iconWrap: { alignItems: "center", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", color: GatiMitraColors.textPrimary, textAlign: "center", marginBottom: 10 },
  body: { fontSize: 16, color: GatiMitraColors.textSecondary, textAlign: "center", lineHeight: 24, marginBottom: 16 },
  note: { fontSize: 13, color: GatiMitraColors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  primary: {
    backgroundColor: GatiMitraColors.emerald,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: {
    borderWidth: 1.5,
    borderColor: GatiMitraColors.emerald,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  secondaryText: { color: GatiMitraColors.emerald, fontSize: 15, fontWeight: "700" },
  tertiary: { paddingVertical: 12, alignItems: "center" },
  tertiaryText: { color: GatiMitraColors.textSecondary, fontSize: 15, fontWeight: "600" },
});
