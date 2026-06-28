// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  parseFoodDeliverySuccessParams,
  riderEarningLikeFromDeliverySuccessParams,
  type FoodDeliverySuccessParams,
} from "@/src/lib/food-delivery-success-nav";
import { formatDistanceKm } from "@/src/lib/incoming-order-display";
import { buildRiderDeliveryEarningBreakdown } from "@/src/lib/rider-earning-display";
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

function breakdownIconForLabel(
  label: string,
  t: (key: string, fallback: string) => string
): React.ComponentProps<typeof Ionicons>["name"] {
  const deliveryFee = t("orders.deliverySuccess.deliveryFee", "Delivery Fee");
  const waiting = t("orders.rideSuccess.waitingCharge", "Waiting Charge");
  const tip = t("orders.deliverySuccess.tip", "Customer tip");
  if (label === deliveryFee) return "cash-outline";
  if (label === waiting) return "time-outline";
  if (label === tip) return "heart-outline";
  if (/surge|rain|night/i.test(label)) return "flash-outline";
  return "pricetag-outline";
}

export function FoodDeliverySuccessScreen({ params: rawParams }: Props) {
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

  const { data: orderDetail, refetch, isRefetching } = useRideOrder(params.orderId, {
    refetchInterval: 4000,
  });

  const customerRating = useMemo(() => {
    const raw = orderDetail?.passengerRating;
    if (raw == null || !Number.isFinite(raw)) return 0;
    return Math.max(0, Math.min(5, Math.round(raw * 10) / 10));
  }, [orderDetail?.passengerRating]);

  const initialTipAmount = Number(params.tipAmount) || 0;
  useRecordDeliverySuccessTipBaseline(params.orderId, initialTipAmount, params.displayId);

  const earningBreakdown = useMemo(() => {
    const source = orderDetail ?? riderEarningLikeFromDeliverySuccessParams(params);
    return buildRiderDeliveryEarningBreakdown(source, t);
  }, [orderDetail, params, t]);

  const breakdownLines = useMemo(
    () => earningBreakdown.lines.filter((line) => !line.emphasis && line.amount > 0),
    [earningBreakdown.lines]
  );

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY });
  }, [queryClient]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      refetch(),
      queryClient.invalidateQueries({ queryKey: RIDER_ACTIVE_ORDERS_QUERY_KEY }),
    ]);
  }, [queryClient, refetch]);

  const totalEarning = earningBreakdown.totalEarning;
  const tripMinutes = Number(params.tripMinutes) || 0;
  const distanceKm = Number(params.distanceKm) || 0;
  const distanceLabel = params.distanceKm
    ? formatDistanceKm(distanceKm)
    : "—";

  const breakdownRows: SuccessBreakdownRow[] = useMemo(() => {
    const baseLabel = t("orders.deliverySuccess.deliveryFee", "Delivery Fee");
    return breakdownLines.map((line) => {
      const isBase = line.label === baseLabel;
      return {
        key: line.label,
        icon: breakdownIconForLabel(line.label, t),
        label: line.label,
        value: formatRupeeLine(line.amount, !isBase),
      };
    });
  }, [breakdownLines, t]);

  const tripTimeValue =
    tripMinutes > 0
      ? `${tripMinutes} ${tripMinutes === 1 ? "min" : "mins"}`
      : "—";

  const tripRatingValue =
    customerRating > 0 ? `${customerRating.toFixed(1)} ★` : "—";

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
      title={t("orders.deliverySuccess.completeTitle", "Delivery Complete! 🎉")}
      subtitle={t(
        "orders.deliverySuccess.completeSubtitle",
        "Great job! You made someone's day better."
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
      onRefresh={() => void handleRefresh()}
      refreshing={isRefetching}
      closeAccessibilityLabel={t("common.close", "Close")}
      ctaAccessibilityLabel={ctaLabel}
    />
  );
}
