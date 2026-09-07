import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { AppAssetImage } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";
import { RiderFonts } from "@/src/theme/fonts";
import { RIDER_AUTH_INK } from "@/src/theme/riderAuthTheme";
import { AuthPrimaryButton } from "@/src/components/auth/AuthPrimaryButton";

type Props = {
  variant: "active" | "completed" | "all";
};

export function SupportEmptyOrders({ variant }: Props) {
  const { t } = useTranslation();
  const isActive = variant === "active";
  const isAll = variant === "all";

  const openSupport = () => {
    router.push({ pathname: "/raise-ticket" });
  };

  return (
    <View style={styles.shell}>
      <View style={styles.card}>
        <AppAssetImage assetKey={RX.auth.hero} style={styles.illus} resizeMode="contain" />
        <Text style={styles.title}>
          {isAll
            ? t("profile.supportFlow.noOrdersTitle", "No orders yet!")
            : isActive
              ? t("profile.supportFlow.noActiveOrdersTitle", "No orders yet!")
              : t("profile.supportFlow.noCompletedOrdersTitle", "No orders yet!")}
        </Text>
        <Text style={styles.sub}>
          {isAll
            ? t(
                "profile.supportFlow.noOrdersSubPenalty",
                "You have no orders on your account to link this penalty issue.",
              )
            : isActive
              ? t(
                  "profile.supportFlow.noActiveOrdersSub",
                  "You have no active orders to report an issue on right now.",
                )
              : t(
                  "profile.supportFlow.noCompletedOrdersSub",
                  "You have not completed any orders to report an issue.",
                )}
        </Text>
        <Text style={styles.needSupport}>
          {t("login.needSupportQuestion", "Need Support?")}
        </Text>
        <View style={styles.reachWrap}>
          <AuthPrimaryButton label={t("login.reachUs", "Reach us")} onPress={openSupport} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { width: "100%" },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  illus: { width: 140, height: 120 },
  title: {
    marginTop: 12,
    fontSize: 18,
    fontFamily: RiderFonts.loraBold,
    color: RIDER_AUTH_INK,
    textAlign: "center",
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: RiderFonts.loraBold,
    color: RIDER_AUTH_INK,
    textAlign: "center",
    lineHeight: 20,
  },
  needSupport: {
    marginTop: 20,
    fontFamily: RiderFonts.loraBold,
    fontSize: 16,
    color: RIDER_AUTH_INK,
    textAlign: "center",
  },
  reachWrap: {
    width: "100%",
    marginTop: 12,
  },
});
