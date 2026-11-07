import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { flexShrinkText } from "@/src/theme/responsiveText";

/** Matches FoodNavigationMapChrome header row height (below safe-area). */
const HEADER_ROW_HEIGHT = 48;

/** Collect strip — light purple + white copy (matches customer unpaid banner). */
const COLLECT_BANNER_BG = "#8B5CF6";
/** Paid strip — blue so it stays distinct from mint CTAs / white chrome. */
const PAID_BANNER_BG = "#2563EB";

type Props = {
  /**
   * `collect` — cash still due at pickup/drop.
   * `paid` — fare already collected / paid online.
   */
  mode?: "collect" | "paid";
  /** When set (collect mode), banner is shown for that collection point. */
  payAt?: "pickup" | "drop" | null;
  visible: boolean;
  /** Amount label, e.g. "₹48.38". */
  amountLabel?: string | null;
};

function ParcelFareCollectBannerInner({
  mode = "collect",
  payAt = "pickup",
  visible,
  amountLabel,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  const isPaid = mode === "paid";
  const title = isPaid
    ? t("orders.activeParcel.farePaidTitle", "Payment Paid")
    : payAt === "drop"
      ? t("orders.activeParcel.fareCollectDropTitle", "Collect fare at Drop")
      : t("orders.activeParcel.fareCollectPickupTitle", "Collect fare at Pickup");
  const body = isPaid
    ? t(
        "orders.activeParcel.farePaidBody",
        "Customer fare is settled for this parcel."
      )
    : payAt === "drop"
      ? t(
          "orders.activeParcel.fareCollectDropBody",
          "Take cash from the receiver before completing delivery."
        )
      : t(
          "orders.activeParcel.fareCollectPickupBody",
          "Take cash from the sender before picking up the parcel."
        );
  const amount = amountLabel?.trim() || null;
  const amountHint = isPaid
    ? t("orders.activeParcel.paidShort", "Paid")
    : t("orders.activeParcel.collectShort", "Collect");
  const a11y = amount ? `${title}. ${body}. ${amount}` : `${title}. ${body}`;

  return (
    <View
      style={[styles.host, { top: insets.top + HEADER_ROW_HEIGHT }]}
      pointerEvents="none"
      accessibilityRole="text"
      accessibilityLabel={a11y}
    >
      <View style={[styles.banner, isPaid ? styles.bannerPaid : styles.bannerCollect]}>
        <View style={styles.copyCol}>
          <Text style={[styles.title, flexShrinkText]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.body, flexShrinkText]} numberOfLines={1}>
            {body}
          </Text>
        </View>
        {amount ? (
          <View style={styles.amountCol}>
            <Text style={styles.amountHint} numberOfLines={1}>
              {amountHint}
            </Text>
            <Text style={styles.amountValue} numberOfLines={1}>
              {amount}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export const ParcelFareCollectBanner = memo(ParcelFareCollectBannerInner);

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 35,
  },
  banner: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 0,
  },
  bannerCollect: {
    backgroundColor: COLLECT_BANNER_BG,
  },
  bannerPaid: {
    backgroundColor: PAID_BANNER_BG,
  },
  copyCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  body: {
    fontSize: 12,
    fontWeight: "400",
    color: "#FFFFFF",
    marginTop: 1,
    opacity: 0.95,
  },
  amountCol: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
  },
  amountHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    opacity: 0.9,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
    marginTop: 1,
  },
});
