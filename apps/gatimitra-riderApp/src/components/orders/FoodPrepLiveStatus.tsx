import React, { memo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { useLiveSecondTicker } from "@/src/hooks/useLiveSecondTicker";
import {
  foodPrepCountdownFromOrder,
  formatPrepDelayedLabel,
  isFoodPrepDelayed,
  prepOverdueSeconds,
} from "@/src/lib/food-prep-delay";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";

type Props = {
  order: RiderOrderSummary;
  active: boolean;
  showPickOrderReopen: boolean;
  onOpenPickOrderSheet?: () => void;
  showPrepBanner: boolean;
};

/**
 * Owns the 1Hz prep ticker so FoodNavigateBottomSheet / slider do not re-render every second.
 */
export const FoodPrepLiveStatus = memo(function FoodPrepLiveStatus({
  order,
  active,
  showPickOrderReopen,
  onOpenPickOrderSheet,
  showPrepBanner,
}: Props) {
  const { t } = useTranslation();
  const nowMs = useLiveSecondTicker(active);
  const merchantReady = order.merchantOrderReady === true;
  const prepOrder = foodPrepCountdownFromOrder(order);
  const prepDelayed = isFoodPrepDelayed(prepOrder, nowMs, merchantReady);
  const overdueSec = prepDelayed ? prepOverdueSeconds(prepOrder, nowMs) : 0;

  if (!active) return null;

  return (
    <>
      {prepDelayed ? (
        <View style={styles.delayBannerWrap}>
          <View style={styles.delayBanner}>
            <Ionicons name="hourglass-outline" size={14} color="#ffffff" />
            <Text style={styles.delayBannerText}>{formatPrepDelayedLabel(overdueSec)}</Text>
          </View>
        </View>
      ) : null}

      {showPickOrderReopen && onOpenPickOrderSheet ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onOpenPickOrderSheet}
          style={[
            styles.pickOrderReopen,
            merchantReady ? styles.pickOrderReopenReady : styles.pickOrderReopenPreparing,
          ]}
        >
          <Ionicons
            name={merchantReady ? "checkmark-circle-outline" : "restaurant-outline"}
            size={20}
            color={merchantReady ? colors.success[700] : colors.warning[700]}
          />
          <View style={styles.pickOrderReopenTextCol}>
            <Text style={styles.pickOrderReopenTitle}>
              {t("orders.activeFood.pickOrderTitle", "Pick order now!")}
            </Text>
            <Text style={styles.pickOrderReopenSub} numberOfLines={1}>
              {prepDelayed
                ? formatPrepDelayedLabel(overdueSec)
                : merchantReady
                  ? t(
                      "orders.activeFood.tapToPickOrder",
                      "Tap to verify and pick up the order"
                    )
                  : t(
                      "orders.activeFood.underPreparation",
                      "Order is under preparation"
                    )}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#5F6368" />
        </TouchableOpacity>
      ) : null}

      {showPrepBanner ? (
        <View
          style={[
            styles.prepBanner,
            prepDelayed
              ? styles.prepBannerDelayed
              : merchantReady
                ? styles.prepBannerReady
                : styles.prepBannerPreparing,
          ]}
        >
          <Ionicons
            name={
              prepDelayed
                ? "hourglass-outline"
                : merchantReady
                  ? "checkmark-circle"
                  : "restaurant-outline"
            }
            size={16}
            color={
              prepDelayed
                ? "#ffffff"
                : merchantReady
                  ? colors.success[700]
                  : colors.warning[700]
            }
          />
          <Text
            style={[
              styles.prepBannerText,
              prepDelayed
                ? styles.prepBannerTextDelayed
                : merchantReady
                  ? styles.prepBannerTextReady
                  : styles.prepBannerTextPreparing,
            ]}
          >
            {prepDelayed
              ? formatPrepDelayedLabel(overdueSec)
              : merchantReady
                ? t("orders.activeFood.orderIsReady", "Order is ready")
                : t(
                    "orders.activeFood.underPreparation",
                    "Order is under preparation"
                  )}
          </Text>
        </View>
      ) : null}
    </>
  );
});

const styles = StyleSheet.create({
  delayBannerWrap: {
    width: "100%",
    marginTop: 4,
    marginBottom: 12,
  },
  delayBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#8B0000",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  delayBannerText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pickOrderReopen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  pickOrderReopenPreparing: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  pickOrderReopenReady: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  pickOrderReopenTextCol: {
    flex: 1,
    minWidth: 0,
  },
  pickOrderReopenTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#202124",
  },
  pickOrderReopenSub: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "500",
    color: "#5F6368",
  },
  prepBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderWidth: 1,
  },
  prepBannerPreparing: {
    backgroundColor: colors.warning[50],
    borderColor: colors.warning[200],
  },
  prepBannerDelayed: {
    backgroundColor: "#8B0000",
    borderColor: "#8B0000",
  },
  prepBannerReady: {
    backgroundColor: colors.success[50],
    borderColor: colors.success[200],
  },
  prepBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  prepBannerTextPreparing: {
    color: colors.warning[800],
  },
  prepBannerTextDelayed: {
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
  prepBannerTextReady: {
    color: colors.success[800],
  },
});
