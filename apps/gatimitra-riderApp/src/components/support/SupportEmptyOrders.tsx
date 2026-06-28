import React from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useTranslation } from "react-i18next";
import { AppAssetImage } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";

type Props = {
  variant: "active" | "completed" | "all";
};

export function SupportEmptyOrders({ variant }: Props) {
  const { t } = useTranslation();
  const isActive = variant === "active";
  const isAll = variant === "all";

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
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  illus: { width: 140, height: 120 },
  title: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
});
