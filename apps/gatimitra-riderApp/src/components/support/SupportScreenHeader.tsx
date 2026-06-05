import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

type Props = {
  title: string;
  subtitle?: string;
  variant?: "default" | "premium";
  /** When set, back uses this instead of router.back() (e.g. tree drill-up). */
  onBack?: () => void;
};

export function SupportScreenHeader({ title, subtitle, variant = "default", onBack }: Props) {
  const premium = variant === "premium";

  return (
    <View style={[styles.header, premium && styles.headerPremium]}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        style={({ pressed }) => [styles.backBtn, premium && styles.backBtnPremium, pressed && styles.backBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={22} color="#0F172A" />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={[styles.headerTitle, premium && styles.headerTitlePremium]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.headerSub, premium && styles.headerSubPremium]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  headerPremium: {
    paddingVertical: 16,
    backgroundColor: "#F1F5F9",
    borderBottomWidth: 0,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  backBtnPremium: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  backBtnPressed: { opacity: 0.75 },
  headerText: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#0F172A" },
  headerTitlePremium: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  headerSub: { marginTop: 2, fontSize: 13, color: "#64748B" },
  headerSubPremium: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 20,
  },
});
