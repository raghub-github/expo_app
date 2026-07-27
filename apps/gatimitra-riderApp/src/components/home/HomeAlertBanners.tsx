// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { openAccountRestrictedSupportTicket } from "@/src/lib/rider-support-navigation";
import { colors } from "@/src/theme";
import { resolveRiderDisplayedEarning } from "@/src/lib/rider-earning-display";
import { BannerPagerIndicators } from "@/src/components/home/HomeAlertBannerCarousel";

const BRAND = colors.primary[500];

const SERVICE_LABELS: Record<string, string> = {
  food: "Food",
  parcel: "Parcel",
  person_ride: "Person Ride",
};

function formatBlockedServiceLabels(services: string[], t: (key: string, fallback: string) => string) {
  return services
    .map((service) => {
      if (service === "food") return t("home.serviceFood", SERVICE_LABELS.food);
      if (service === "parcel") return t("home.serviceParcel", SERVICE_LABELS.parcel);
      if (service === "person_ride") return t("home.servicePersonRide", SERVICE_LABELS.person_ride);
      return service;
    })
    .join(", ");
}

type AccountRestrictedBannerProps = {
  blockedServices?: string[];
  allServicesBlacklisted?: boolean;
  globalWalletBlock?: boolean;
  onSupport?: () => void;
};

export function AccountRestrictedBanner({
  blockedServices = [],
  allServicesBlacklisted = false,
  globalWalletBlock = false,
  onSupport,
}: AccountRestrictedBannerProps) {
  const { t } = useTranslation();

  const restrictedSub =
    allServicesBlacklisted || blockedServices.length >= 3
      ? globalWalletBlock
        ? t(
            "home.accountRestrictedWalletAll",
            "Your account is Restricted for All services. Add balance to wallet to unlock."
          )
        : t(
            "home.accountRestrictedAllServices",
            "Your account is Restricted for All services. Please contact Support to resolve."
          )
      : blockedServices.length > 0
        ? t(
            "home.accountRestrictedForServices",
            "Your account is Restricted for {{services}}. Please contact Support to resolve.",
            { services: formatBlockedServiceLabels(blockedServices, t) }
          )
        : t(
            "home.accountRestrictedSub",
            "Please contact Support to request whitelisting or resolve the issue."
          );

  return (
    <View style={styles.restrictedWrap}>
      <View style={styles.restrictedIcon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.bannerTextCol}>
        <Text style={styles.restrictedTitle}>
          {t("home.accountRestrictedTitle", "Account Restricted")}
        </Text>
        <Text style={styles.restrictedSub}>{restrictedSub}</Text>
      </View>
      <View style={styles.ctaCol}>
        <Pressable
          style={styles.supportBtn}
          onPress={onSupport ?? openAccountRestrictedSupportTicket}
        >
          <Text style={styles.supportBtnText}>{t("home.support", "Support")}</Text>
        </Pressable>
        <BannerPagerIndicators />
      </View>
    </View>
  );
}

type PenaltyBannerProps = {
  amount: number;
  onPay?: () => void;
  paying?: boolean;
};

export function PenaltyBanner({ amount, onPay, paying = false }: PenaltyBannerProps) {
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
      <View style={styles.ctaCol}>
        <Pressable
          style={[styles.payBtn, paying && styles.payBtnDisabled]}
          disabled={paying}
          onPress={onPay ?? (() => router.push("/(tabs)/earnings"))}
        >
          <Text style={styles.payBtnText}>
            {paying
              ? t("home.payingPenalty", "Processing…")
              : t("home.payPenalty", "Pay ₹{{amount}}", {
                  amount: Number.isInteger(amount) ? amount : amount.toFixed(2),
                })}
          </Text>
        </Pressable>
        <BannerPagerIndicators />
      </View>
    </View>
  );
}

type RidePaymentHoldBannerProps = {
  hold: {
    orderId: string;
    formattedOrderId: string | null;
    totalEarning: number;
  };
  onView?: () => void;
};

export function RidePaymentHoldBanner({ hold, onView }: RidePaymentHoldBannerProps) {
  const { t } = useTranslation();
  const displayId = hold.formattedOrderId?.trim() || hold.orderId;
  const amount = resolveRiderDisplayedEarning({ totalEarning: hold.totalEarning });
  if (amount <= 0) return null;

  return (
    <View style={styles.penaltyWrap}>
      <View style={styles.penaltyIcon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.bannerTextCol}>
        <Text style={styles.penaltyTitle}>
          {t("home.ridePaymentHoldTitle", "Customer payment pending !")}
        </Text>
        <Text style={styles.penaltySub}>
          {t(
            "home.ridePaymentHoldSub",
            "Wait for passenger payment before your earnings unlock"
          )}
        </Text>
      </View>
      <View style={styles.ctaCol}>
        <Pressable
          style={styles.payBtn}
          onPress={
            onView ??
            (() =>
              router.push({
                pathname: "/ride-payment-waiting",
                params: { orderId: hold.orderId, displayId },
              }))
          }
        >
          <Text style={styles.payBtnText}>
            {t("home.ridePaymentHoldCta", "View ₹{{amount}}", { amount })}
          </Text>
        </Pressable>
        <BannerPagerIndicators />
      </View>
    </View>
  );
}

type OffDutyBannerProps = {
  visible: boolean;
  onTurnOn: () => void;
  loading?: boolean;
  /** Subscription penalty duty stop — Turn On opens blocked sheet instead. */
  dutyLocked?: boolean;
};

export function OffDutyBanner({ visible, onTurnOn, loading, dutyLocked = false }: OffDutyBannerProps) {
  const { t } = useTranslation();
  if (!visible) return null;

  return (
    <View style={styles.offDutyWrap}>
      <View style={styles.offDutyIcon}>
        <Ionicons name="warning" size={18} color="#ffffff" />
      </View>
      <View style={styles.bannerTextCol}>
        <Text style={styles.offDutyTitle}>
          {dutyLocked
            ? t("home.subscriptionDutyStopTitle", "Duty stopped — subscription penalty")
            : t("home.notReceivingOrders", "Not receiving new orders!")}
        </Text>
        <Text style={styles.offDutySub}>
          {dutyLocked
            ? t(
                "home.subscriptionDutyStopSub",
                "Clear subscription dues to turn ON duty and receive orders"
              )
            : t("home.turnOnDutySub", "Turn ON DUTY to start receiving orders")}
        </Text>
      </View>
      <Pressable
        style={[styles.turnOnBtn, loading && { opacity: 0.7 }, dutyLocked && styles.turnOnBtnLocked]}
        onPress={onTurnOn}
        disabled={loading}
        hitSlop={12}
        accessibilityRole="button"
      >
        <Text style={[styles.turnOnBtnText, dutyLocked && styles.turnOnBtnTextLocked]}>
          {dutyLocked
            ? t("home.whyDutyBlocked", "Why?")
            : t("home.turnOn", "Turn On")}
        </Text>
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
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#D4A017",
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 12,
    gap: 10,
  },
  restrictedWrap: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DC2626",
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 12,
    gap: 10,
  },
  restrictedIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  restrictedTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#ffffff",
  },
  restrictedSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
    lineHeight: 15,
  },
  supportBtn: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  supportBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[900],
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
    flexShrink: 0,
  },
  payBtnDisabled: {
    opacity: 0.7,
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
  turnOnBtnLocked: {
    backgroundColor: "#FEF2F2",
  },
  turnOnBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#16A34A",
  },
  turnOnBtnTextLocked: {
    color: "#B91C1C",
  },
  bannerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  ctaCol: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginRight: 6,
    marginLeft: 2,
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
