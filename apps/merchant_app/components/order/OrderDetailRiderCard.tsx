import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import type { FoodOrderRiderLogEntry } from "@/services/ordersApi";
import type { OrderRecord, OrderStage } from "@/hooks/useOrders";
import {
  isInactiveRiderAssignment,
  orderHasAssignedRider,
  pendingRiderStatusLabel,
  resolveRiderHistoryExcludingCurrent,
} from "@/lib/orderAssignedRider";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { RiderAssignPendingCard } from "@/components/order/RiderAssignPendingCard";
import type { NearbyDispatchRiderSummary } from "@/components/order/RiderAssignPendingCard";
import { OrderRiderLogSheet } from "@/components/order/OrderRiderLogSheet";
import { MerchantAssignedRiderRow } from "@/components/order/MerchantAssignedRiderRow";
import { GatiMitraMerchant, CARD_RADIUS, CARD_PADDING, FONT_SECONDARY } from "@/constants/theme";

type Props = {
  rider: FoodOrderRiderLogEntry | null;
  /** Full riders-log for this order (current + past). */
  ridersLog?: FoodOrderRiderLogEntry[];
  /** Board/detail OrderRecord — powers live Track + Call for the current assignee. */
  orderRecord?: OrderRecord | null;
  deliveryType: string;
  riderReachedAt?: string | null;
  orderStage?: OrderStage;
  showPendingAssign?: boolean;
  nearbySummary?: NearbyDispatchRiderSummary | null;
};

function riderStatusLabel(
  rider: FoodOrderRiderLogEntry | null,
  reachedAt?: string | null,
  orderStage?: OrderStage
): string {
  if (!rider) {
    return pendingRiderStatusLabel(orderStage ?? "created");
  }
  if (isInactiveRiderAssignment(rider.assignment_status, rider.cancelled_at, rider.rejected_at)) {
    if (rider.picked_up_at) return "Cancelled after pickup — do not handover";
    return "Assignment cancelled — do not handover";
  }
  if (rider.delivered_at) return "Delivered by rider";
  if (rider.picked_up_at) return "Out for delivery";
  if (reachedAt || rider.reached_merchant_at) return "Rider at store";
  if (rider.accepted_at) return "Rider on the way";
  if (rider.assigned_at) return "Rider assigned";
  return "Delivery partner";
}

function CancelledRiderRow({
  rider,
  reachedAt,
  orderStage,
}: {
  rider: FoodOrderRiderLogEntry;
  reachedAt?: string | null;
  orderStage?: OrderStage;
}) {
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const status = riderStatusLabel(rider, reachedAt, orderStage);
  const name = (rider.rider_name ?? "").trim() || "Delivery partner";
  const mobile = (rider.rider_mobile ?? "").trim();

  return (
    <View style={[styles.card, styles.cardMuted]}>
      <View style={styles.row}>
        <RiderSelfieAvatar
          selfieUrl={rider.selfie_url}
          riderName={name}
          size={44}
          onPress={() => setSelfieModalOpen(true)}
        />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.status, styles.statusCancelled]}>{status}</Text>
        </View>
        {mobile ? (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${mobile}`)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            accessibilityLabel={`Call ${name}`}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.warnBanner}>
        <Ionicons name="warning-outline" size={14} color="#991B1B" />
        <Text style={styles.warnText}>
          Previously assigned — cancelled. Do not hand over this order to this rider.
        </Text>
      </View>

      <RiderSelfieViewerModal
        visible={selfieModalOpen}
        imageUrl={rider.selfie_url ?? null}
        riderName={name}
        onClose={() => setSelfieModalOpen(false)}
      />
    </View>
  );
}

export function OrderDetailRiderCard({
  rider,
  ridersLog = [],
  orderRecord = null,
  deliveryType,
  riderReachedAt,
  orderStage,
  showPendingAssign = false,
  nearbySummary = null,
}: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const isGatiMitra = String(deliveryType).toUpperCase() === "GATIMITRA_RIDER";

  const historyRiders = useMemo(
    () => resolveRiderHistoryExcludingCurrent(ridersLog, rider),
    [ridersLog, rider]
  );

  /** "View old" only when more than one distinct rider was involved. */
  const showLogButton = useMemo(() => {
    if (historyRiders.length === 0) return false;
    const ids = new Set<number>();
    for (const r of ridersLog) {
      const id = Number(r.rider_id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    if (rider?.rider_id != null) {
      const id = Number(rider.rider_id);
      if (Number.isFinite(id) && id > 0) ids.add(id);
    }
    return ids.size > 1;
  }, [historyRiders.length, ridersLog, rider]);

  const assignedOrder = useMemo(() => {
    if (!orderRecord) return null;
    const activeLogRider =
      rider &&
      !isInactiveRiderAssignment(rider.assignment_status, rider.cancelled_at, rider.rejected_at)
        ? rider
        : null;
    const deliveredLogRider =
      orderRecord.status === "delivered"
        ? rider ??
          ridersLog.find(
            (r) =>
              (r.delivered_at != null ||
                String(r.assignment_status ?? "").toUpperCase() === "DELIVERED") &&
              !isInactiveRiderAssignment(r.assignment_status, r.cancelled_at, r.rejected_at)
          ) ??
          ridersLog.find((r) => (r.rider_name ?? "").trim().length > 0) ??
          null
        : null;

    const resolvedRider = activeLogRider ?? deliveredLogRider;
    const hasRiderIdentity =
      orderHasAssignedRider(orderRecord) ||
      (resolvedRider != null &&
        (Number(resolvedRider.rider_id) > 0 || Boolean((resolvedRider.rider_name ?? "").trim())));

    if (!hasRiderIdentity) return null;

    return {
      ...orderRecord,
      riderId: resolvedRider?.rider_id || orderRecord.riderId,
      riderName:
        (resolvedRider?.rider_name ?? "").trim() ||
        (orderRecord.riderName ?? "").trim() ||
        null,
      riderMobile:
        (resolvedRider?.rider_mobile ?? "").trim() ||
        (orderRecord.riderMobile ?? "").trim() ||
        null,
      riderSelfieUrl: resolvedRider?.selfie_url ?? orderRecord.riderSelfieUrl,
      riderAssignmentStatus:
        resolvedRider?.assignment_status || orderRecord.riderAssignmentStatus,
      riderReachedAt:
        resolvedRider?.reached_merchant_at ??
        riderReachedAt ??
        orderRecord.riderReachedAt,
      reachedMerchantAt:
        resolvedRider?.reached_merchant_at ?? orderRecord.reachedMerchantAt,
      riderPickedUpAt: resolvedRider?.picked_up_at ?? orderRecord.riderPickedUpAt,
    };
  }, [orderRecord, rider, riderReachedAt, ridersLog]);

  if (!isGatiMitra && !rider && historyRiders.length === 0 && !assignedOrder) return null;

  const activeInactive =
    rider != null &&
    isInactiveRiderAssignment(rider.assignment_status, rider.cancelled_at, rider.rejected_at);

  const showLiveAssigned = assignedOrder != null;
  const hasContent =
    (showPendingAssign && !showLiveAssigned) ||
    showLiveAssigned ||
    (!showLiveAssigned && rider != null && activeInactive) ||
    showLogButton;

  if (!hasContent) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Delivery partner</Text>
        {showLogButton ? (
          <Pressable
            onPress={() => setLogOpen(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.logBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View old riders"
          >
            <Ionicons name="time-outline" size={14} color={GatiMitraMerchant.primary} />
            <Text style={styles.logBtnText}>View old</Text>
          </Pressable>
        ) : null}
      </View>

      {showPendingAssign && !showLiveAssigned ? (
        <View style={styles.pendingCard}>
          <RiderAssignPendingCard summary={nearbySummary} embedded />
        </View>
      ) : null}

      {showLiveAssigned && assignedOrder ? (
        <View style={styles.card}>
          <MerchantAssignedRiderRow order={assignedOrder} embedded alwaysVisibleTracking />
        </View>
      ) : null}

      {!showLiveAssigned && rider && activeInactive ? (
        <CancelledRiderRow rider={rider} reachedAt={riderReachedAt} orderStage={orderStage} />
      ) : null}

      <OrderRiderLogSheet
        visible={logOpen}
        riders={historyRiders}
        onClose={() => setLogOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  heading: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  logBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
    flexShrink: 0,
    maxWidth: "52%",
  },
  logBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: CARD_PADDING,
  },
  cardMuted: {
    backgroundColor: "#FAFAFA",
    borderColor: "#FECACA",
  },
  pendingCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  status: {
    fontSize: FONT_SECONDARY,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  statusCancelled: {
    color: "#B91C1C",
    fontWeight: "700",
  },
  warnBanner: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  warnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#991B1B",
    lineHeight: 16,
  },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
});
