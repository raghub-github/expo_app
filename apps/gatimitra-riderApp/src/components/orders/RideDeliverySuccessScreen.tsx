// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useMemo, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  parseFoodDeliverySuccessParams,
  resolveRiderDeliveryTipAmount,
  type FoodDeliverySuccessParams,
} from "@/src/lib/food-delivery-success-nav";
import { formatDistanceKm } from "@/src/lib/incoming-order-display";
import {
  isActiveRiderOrder,
  openActiveOrder,
  pickPrimaryActiveOrder,
} from "@/src/lib/active-order-display";
import {
  RIDER_ACTIVE_ORDERS_QUERY_KEY,
  useActiveOrders,
  useRideOrder,
} from "@/src/hooks/useOrders";
import {
  RiderDeliverySuccessLayout,
  type SuccessBreakdownRow,
} from "@/src/components/orders/RiderDeliverySuccessLayout";
import { useRecordDeliverySuccessTipBaseline } from "@/src/hooks/useRecordDeliverySuccessTipBaseline";

type Props = {
  params: Record<string, string | string[] | undefined>;
};

function formatRupeeLine(amount: number, prefixPlus = false): string {
  const n = Math.round(amount * 10) / 10;
  const formatted = `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
  return prefixPlus ? `+ ${formatted}` : formatted;
}

function surgeIconForName(name: string): React.ComponentProps<typeof Ionicons>["name"] {
  const lower = name.toLowerCase();
  if (lower.includes("night")) return "moon-outline";
  if (lower.includes("rain")) return "rainy-outline";
  return "flash-outline";
}

export function RideDeliverySuccessScreen({ params: rawParams }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params: FoodDeliverySuccessParams = parseFoodDeliverySuccessParams(rawParams);

  const { data: activeOrders = [] } = useActiveOrders();
  const nextOrder = useMemo(() => {
    const remaining = activeOrders.filter(
      (order) => isActiveRiderOrder(order) && order.id !== params.orderId
    );
    return pickPrimaryActiveOrder(remaining);
  }, [activeOrders, params.orderId]);

  const navigatedRef = useRef(false);

  const { data: orderDetail } = useRideOrder(params.orderId, {
    refetchInterval: 4000,
  });

  const passengerRating = useMemo(() => {
    const raw = orderDetail?.passengerRating;
    if (raw == null || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(5, Math.round(raw * 10) / 10));
  }, [orderDetail?.passengerRating]);

  const initialTipAmount = Number(params.tipAmount) || 0;
  useRecordDeliverySuccessTipBaseline(params.orderId, initialTipAmount, params.displayId);

  const currentTipAmount = useMemo(
    () => resolveRiderDeliveryTipAmount(orderDetail, initialTipAmount),
    [orderDetail, initialTipAmount]
  );

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
  }, [queryClient]);

  const totalEarning = Number(params.totalEarning) || 0;
  const baseEarning = Number(params.baseEarning) || 0;
  const tipAmount = currentTipAmount;
  const waitingEarning = Number(params.waitingEarning) || 0;
  const surgeEarning = Number(params.surgeEarning) || 0;
  const appliedSurges = useMemo(() => {
    try {
      const parsed = JSON.parse(params.appliedSurgesJson || "[]") as unknown;
      if (!Array.isArray(parsed)) return [] as { name: string; amount: number }[];
      return parsed
        .map((line) => {
          if (line == null || typeof line !== "object") return null;
          const row = line as { name?: unknown; amount?: unknown };
          const name = String(row.name ?? "").trim();
          const amount = Number(row.amount);
          if (!name || !Number.isFinite(amount) || amount <= 0) return null;
          return { name, amount: Math.round(amount) };
        })
        .filter((x): x is { name: string; amount: number } => x != null);
    } catch {
      return [] as { name: string; amount: number }[];
    }
  }, [params.appliedSurgesJson]);

  const tripMinutes = Number(params.tripMinutes) || 0;
  const distanceKm = Number(params.distanceKm) || 0;
  const distanceLabel = params.distanceKm
    ? formatDistanceKm(distanceKm)
    : "—";

  const breakdownRows: SuccessBreakdownRow[] = useMemo(() => {
    const rows: SuccessBreakdownRow[] = [];
    if (baseEarning > 0) {
      rows.push({
        key: "ride-fare",
        icon: "cash-outline",
        label: t("orders.rideSuccess.rideFare", "Ride Fare"),
        value: formatRupeeLine(baseEarning),
      });
    }
    if (waitingEarning > 0) {
      rows.push({
        key: "waiting",
        icon: "time-outline",
        label: t("orders.rideSuccess.waitingCharge", "Waiting Charge"),
        value: formatRupeeLine(waitingEarning, true),
      });
    }
    if (appliedSurges.length > 0) {
      for (const line of appliedSurges) {
        rows.push({
          key: line.name,
          icon: surgeIconForName(line.name),
          label: line.name,
          value: formatRupeeLine(line.amount, true),
        });
      }
    } else if (surgeEarning > 0) {
      rows.push({
        key: "surge",
        icon: "flash-outline",
        label: t("orders.rideSuccess.surgeBonus", "Surge bonus"),
        value: formatRupeeLine(surgeEarning, true),
      });
    }
    if (tipAmount > 0) {
      rows.push({
        key: "tip",
        icon: "heart-outline",
        label: t("orders.deliverySuccess.tip", "Customer tip"),
        value: formatRupeeLine(tipAmount, true),
      });
    }
    return rows;
  }, [appliedSurges, baseEarning, surgeEarning, tipAmount, waitingEarning, t]);

  const tripTimeValue =
    tripMinutes > 0
      ? `${tripMinutes} ${tripMinutes === 1 ? "min" : "mins"}`
      : "—";

  const tripRatingValue =
    passengerRating > 0 ? `${passengerRating.toFixed(1)} ★` : "—";

  const hasNextOrder = nextOrder != null;
  const ctaLabel = hasNextOrder
    ? t("orders.deliverySuccess.goToNextOrder", "Get next order")
    : t("orders.deliverySuccess.goToHome", "Go to Home");

  const handlePrimaryCta = () => {
    if (navigatedRef.current) return;
    navigatedRef.current = true;
    if (nextOrder) {
      openActiveOrder(nextOrder);
      return;
    }
    router.replace("/(tabs)/orders");
  };

  const handleClose = () => {
    router.replace("/(tabs)/orders");
  };

  return (
    <RiderDeliverySuccessLayout
      title={t("orders.rideSuccess.title", "Ride Completed")}
      subtitle={t(
        "orders.rideSuccess.subtitle",
        "Your passenger has reached their destination safely."
      )}
      totalEarning={totalEarning}
      paymentBadgeLabel={t("orders.deliverySuccess.paymentCredited", "Payment Credited")}
      breakdownTitle={t("orders.deliverySuccess.earningsBreakdown", "Earnings Breakdown")}
      breakdownRows={breakdownRows}
      totalEarningsLabel={t("orders.deliverySuccess.totalEarnings", "Total Earnings")}
      tripDetailsTitle={t("orders.deliverySuccess.tripDetails", "Trip Details")}
      tripDistanceLabel={t("orders.deliverySuccess.tripDistance", "Trip Distance")}
      tripDistanceValue={distanceLabel}
      tripTimeLabel={t("orders.deliverySuccess.tripTime", "Trip Time")}
      tripTimeValue={tripTimeValue}
      tripRatingLabel={t("orders.deliverySuccess.tripRating", "Trip Rating")}
      tripRatingValue={tripRatingValue}
      championTitle={t("orders.deliverySuccess.championTitle", "Keep it up, Champion! 💪")}
      championSubtitle={t(
        "orders.deliverySuccess.championSubtitle",
        "Your hard work is appreciated."
      )}
      ctaLabel={ctaLabel}
      onClose={handleClose}
      onPrimaryCta={handlePrimaryCta}
      closeAccessibilityLabel={t("common.close", "Close")}
      ctaAccessibilityLabel={ctaLabel}
    />
  );
}
