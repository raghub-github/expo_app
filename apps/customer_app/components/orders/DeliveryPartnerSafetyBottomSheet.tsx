/**
 * Zomato-style delivery partner safety explainer — live order tracking.
 */

import type { ReactNode } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const HEADER_TINT = "#E8F4FD";

type SafetyFeature = {
  icon: ReactNode;
  title: string;
  subtitle?: string;
};

const SAFETY_FEATURES: SafetyFeature[] = [
  {
    icon: <MaterialCommunityIcons name="timer-outline" size={28} color="#2563EB" />,
    title: "No time-based pressure",
  },
  {
    icon: <MaterialCommunityIcons name="ambulance" size={28} color="#DC2626" />,
    title: "15-min ambulance & 24x7 SOS helpline",
  },
  {
    icon: <MaterialCommunityIcons name="shield-check" size={28} color={MINT_DARK} />,
    title: "Verified partners & in-app emergency SOS on every trip",
    subtitle: "Partners are onboarded with ID checks and can raise SOS instantly from the rider app.",
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function DeliveryPartnerSafetyBottomSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.62}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            <Text style={styles.headerTitle}>How do we keep our delivery partners safe?</Text>
          </View>
          <View style={styles.headerShieldWrap}>
            <View style={styles.headerShield}>
              <Ionicons name="shield-checkmark" size={36} color="#60A5FA" />
            </View>
          </View>
        </View>

        <View style={styles.featureList}>
          {SAFETY_FEATURES.map((feature, index) => (
            <View
              key={feature.title}
              style={[styles.featureRow, index < SAFETY_FEATURES.length - 1 && styles.featureRowBorder]}
            >
              <View style={styles.featureIconWrap}>{feature.icon}</View>
              <View style={styles.featureTextWrap}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                {feature.subtitle ? (
                  <Text style={styles.featureSub}>{feature.subtitle}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.ctaBtn} onPress={onClose} activeOpacity={0.88}>
          <Text style={styles.ctaBtnText}>Ok, got it!</Text>
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: HEADER_TINT,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    gap: 12,
  },
  headerTextCol: {
    flex: 1,
    paddingTop: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: TEXT,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  headerShieldWrap: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  headerShield: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureList: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingVertical: 16,
  },
  featureRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  featureIconWrap: {
    width: 40,
    alignItems: "center",
    paddingTop: 2,
  },
  featureTextWrap: {
    flex: 1,
    gap: 4,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT,
    lineHeight: 21,
  },
  featureSub: {
    fontSize: 12,
    fontWeight: "500",
    color: MUTED,
    lineHeight: 17,
  },
  ctaBtn: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: MINT,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
});
