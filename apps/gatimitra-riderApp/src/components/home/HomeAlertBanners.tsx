import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { colors } from "@/src/theme";

const BRAND = colors.primary[500];

type PenaltyBannerProps = {
  amount: number;
  onPay?: () => void;
};

export function PenaltyBanner({ amount, onPay }: PenaltyBannerProps) {
  const { t } = useTranslation();
  if (amount <= 0) return null;

  return (
    <View style={styles.penaltyWrap}>
      <View style={styles.penaltyIcon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.bannerTextCol}>
        <Text style={styles.penaltyTitle}>
          {t("home.penaltyTitle", "Duty stopped due to penalty !")}
        </Text>
        <Text style={styles.penaltySub}>
          {t("home.penaltySub", "Pay penalty amount to start receiving orders")}
        </Text>
      </View>
      <Pressable
        style={styles.payBtn}
        onPress={onPay ?? (() => router.push("/(tabs)/ledger"))}
      >
        <Text style={styles.payBtnText}>
          {t("home.payPenalty", "Pay ₹{{amount}}", { amount: Math.round(amount) })}
        </Text>
      </Pressable>
    </View>
  );
}

type OffDutyBannerProps = {
  visible: boolean;
  onTurnOn: () => void;
  loading?: boolean;
};

export function OffDutyBanner({ visible, onTurnOn, loading }: OffDutyBannerProps) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.offDutyWrap}>
      <View style={styles.offDutyIcon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.bannerTextCol}>
        <Text style={styles.offDutyTitle}>
          {t("home.notReceivingOrders", "Not receiving new orders!")}
        </Text>
        <Text style={styles.offDutySub}>
          {t("home.turnOnDutySub", "Turn ON DUTY to start receiving orders")}
        </Text>
      </View>
      <Pressable
        style={[styles.turnOnBtn, loading && { opacity: 0.7 }]}
        onPress={onTurnOn}
        disabled={loading}
      >
        <Text style={styles.turnOnBtnText}>{t("home.turnOn", "Turn On")}</Text>
      </Pressable>
    </View>
  );
}

export function MapRecenterFab({
  onPress,
  style,
  embedded = false,
  pill = false,
}: {
  onPress: () => void;
  style?: object;
  embedded?: boolean;
  /** Google Maps–style labelled re-centre control. */
  pill?: boolean;
}) {
  if (pill) {
    return (
      <Pressable
        style={[styles.fabPill, style]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Re-centre map"
      >
        <Ionicons name="navigate" size={18} color={BRAND} />
        <Text style={styles.fabPillText}>Re-centre</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[embedded ? styles.fabEmbedded : styles.fab, style]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name="locate" size={22} color={BRAND} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  penaltyWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D4A017",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  penaltyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  penaltyTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  penaltySub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  payBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  payBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[900],
  },
  offDutyWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DC2626",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  offDutyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  offDutyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  offDutySub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  turnOnBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  turnOnBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#16A34A",
  },
  bannerTextCol: {
    flex: 1,
  },
  fab: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 11,
  },
  fabPill: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    borderColor: BRAND,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 5,
    zIndex: 11,
  },
  fabPillText: {
    fontSize: 14,
    fontWeight: "700",
    color: BRAND,
  },
  fabEmbedded: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 2,
    borderColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
  },
});
