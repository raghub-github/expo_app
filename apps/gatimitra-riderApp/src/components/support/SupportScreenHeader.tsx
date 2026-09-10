import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { RiderFonts } from "@/src/theme/fonts";
import { RIDER_AUTH_BG, RIDER_AUTH_INK, RIDER_AUTH_MUTED } from "@/src/theme/riderAuthTheme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

type Props = {
  title: string;
  subtitle?: string;
  variant?: "default" | "premium";
  /** When set, back uses this instead of router.back() (e.g. tree drill-up). */
  onBack?: () => void;
};

export function SupportScreenHeader({ title, subtitle, variant = "default", onBack }: Props) {
  const premium = variant === "premium";
  const { rs } = useResponsiveLayout();

  return (
    <View
      style={[
        rowLayout.row,
        styles.header,
        premium && styles.headerPremium,
        { paddingHorizontal: rs(16), paddingVertical: premium ? rs(20) : rs(12) },
      ]}
    >
      <Pressable
        onPress={onBack ?? (() => router.back())}
        style={({ pressed }) => [
          styles.backBtn,
          rowLayout.noShrink,
          premium && styles.backBtnPremium,
          pressed && styles.backBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Ionicons name="arrow-back" size={22} color={RIDER_AUTH_INK} />
      </Pressable>
      <View style={[styles.headerText, rowLayout.grow]}>
        <Text
          style={[styles.headerTitle, premium && styles.headerTitlePremium, flexShrinkText]}
          numberOfLines={premium ? 3 : 2}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.headerSub, premium && styles.headerSubPremium, flexShrinkText]}
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    maxWidth: "100%",
  },
  headerPremium: {
    backgroundColor: RIDER_AUTH_BG,
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
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: RIDER_AUTH_INK,
  },
  headerSub: { marginTop: 2, fontSize: 13, color: "#64748B" },
  headerSubPremium: {
    marginTop: 10,
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 15,
    fontWeight: "600",
    color: RIDER_AUTH_MUTED,
    lineHeight: 22,
  },
});
