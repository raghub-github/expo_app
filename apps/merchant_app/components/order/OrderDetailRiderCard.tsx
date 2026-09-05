import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import type { FoodOrderRiderLogEntry } from "@/services/ordersApi";
import type { OrderRecord, OrderStage } from "@/hooks/useOrders";
import {
  isInactiveRiderAssignment,
  logRowsAreSameAssignment,
  orderHasAssignedRider,
  pendingRiderStatusLabel,
  resolvePickupRiderFromLog,
  shouldShowAllRidersButton,
  sortRidersLogForDisplay,
} from "@/lib/orderAssignedRider";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { RiderAssignPendingCard } from "@/components/order/RiderAssignPendingCard";
import type { NearbyDispatchRiderSummary } from "@/components/order/RiderAssignPendingCard";
import { OrderRiderLogSheet } from "@/components/order/OrderRiderLogSheet";
import { MerchantAssignedRiderRow } from "@/components/order/MerchantAssignedRiderRow";
import { RiderAssignmentHorizontalTimeline } from "@/components/order/RiderAssignmentHorizontalTimeline";
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
  /** Hide rider call / number after the order is delivered or cancelled. */
  allowCall?: boolean;
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
    if (rider.picked_up_at) return "Cancelled after pickup";
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
  allowCall,
}: {
  rider: FoodOrderRiderLogEntry;
  reachedAt?: string | null;
  orderStage?: OrderStage;
  allowCall: boolean;
}) {
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const status = riderStatusLabel(rider, reachedAt, orderStage);
  const name = (rider.rider_name ?? "").trim() || "Delivery partner";
  const mobile = (rider.rider_mobile ?? "").trim();
  const pickedUp = Boolean(rider.picked_up_at?.trim());

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
          {pickedUp ? (
            <View style={styles.pickupBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#047857" />
              <Text style={styles.pickupBadgeText}>Picked up this order</Text>
            </View>
          ) : null}
        </View>
        {allowCall && mobile ? (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${mobile}`)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            accessibilityLabel={`Call ${name}`}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
      <RiderAssignmentHorizontalTimeline rider={rider} />
      {!pickedUp ? (
        <View style={styles.warnBanner}>
          <Ionicons name="warning-outline" size={14} color="#991B1B" />
          <Text style={styles.warnText}>
            Previously assigned — cancelled. Do not hand over this order to this rider.
          </Text>
        </View>
      ) : null}

      <RiderSelfieViewerModal
        visible={selfieModalOpen}
        imageUrl={rider.selfie_url ?? null}
        riderName={name}
        onClose={() => setSelfieModalOpen(false)}
      />
    </View>
  );
}

function PickupRecordRow({
  rider,
  allowCall,
}: {
  rider: FoodOrderRiderLogEntry;
  allowCall: boolean;
}) {
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);
  const name = (rider.rider_name ?? "").trim() || "Delivery partner";
  const mobile = (rider.rider_mobile ?? "").trim();

  return (
    <View style={[styles.card, styles.cardPickup]}>
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
          <View style={styles.pickupBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#047857" />
            <Text style={styles.pickupBadgeText}>Picked up this order</Text>
          </View>
        </View>
        {allowCall && mobile ? (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${mobile}`)}
            style={({ pressed }) => [styles.callBtn, pressed && styles.pressed]}
            accessibilityLabel={`Call ${name}`}
          >
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>
      <RiderAssignmentHorizontalTimeline rider={rider} />
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
  allowCall = false,
}: Props) {
  const [logOpen, setLogOpen] = useState(false);
  const deliveryTypeUpper = String(deliveryType).toUpperCase();
  const isGatiMitra = deliveryTypeUpper === "GATIMITRA_RIDER";
  const isSelfPickup = deliveryTypeUpper === "SELF_PICKUP";

  const allRiders = useMemo(() => {
    const merged = [...ridersLog];
    if (rider && !merged.some((r) => logRowsAreSameAssignment(r, rider))) {
      merged.push(rider);
    }
    return sortRidersLogForDisplay(merged);
  }, [ridersLog, rider]);
  const pickupRider = useMemo(() => resolvePickupRiderFromLog(allRiders), [allRiders]);
  const showAllRidersButton = shouldShowAllRidersButton(allRiders);

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

  if (isSelfPickup) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.fulfillmentHeading}>Fulfillment</Text>
        <View style={styles.selfPickupCard}>
          <View style={styles.selfPickupIcon}>
            <Ionicons name="walk-outline" size={16} color="#92400E" />
          </View>
          <View style={styles.selfPickupBody}>
            <Text style={styles.selfPickupTitle} numberOfLines={1}>
              Self-Pick-Up
            </Text>
            <Text style={styles.selfPickupSub} numberOfLines={2}>
              Customer will come to the store and pick up this order.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!isGatiMitra && !rider && allRiders.length === 0 && !assignedOrder) return null;

  const activeInactive =
    rider != null &&
    isInactiveRiderAssignment(rider.assignment_status, rider.cancelled_at, rider.rejected_at);

  const showLiveAssigned = assignedOrder != null;
  const pickupOnLiveCard =
    pickupRider != null &&
    assignedOrder != null &&
    Number(assignedOrder.riderId) === Number(pickupRider.rider_id) &&
    Boolean(assignedOrder.riderPickedUpAt);
  const pickupOnCancelledCard =
    pickupRider != null && rider != null && logRowsAreSameAssignment(rider, pickupRider);
  const showSeparatePickupCard =
    pickupRider != null && !pickupOnLiveCard && !pickupOnCancelledCard;

  const hasContent =
    (showPendingAssign && !showLiveAssigned) ||
    showLiveAssigned ||
    (!showLiveAssigned && rider != null && activeInactive) ||
    showSeparatePickupCard ||
    showAllRidersButton;

  if (!hasContent) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>Delivery partner</Text>
        {showAllRidersButton ? (
          <Pressable
            onPress={() => setLogOpen(true)}
            hitSlop={8}
            style={({ pressed }) => [styles.headingAllBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="View all riders"
          >
            <Ionicons name="people-outline" size={15} color={GatiMitraMerchant.primary} />
            <Text style={styles.headingAllBtnText}>View all riders</Text>
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
          <MerchantAssignedRiderRow
            order={assignedOrder}
            embedded
            alwaysVisibleTracking
            showCall={allowCall}
          />
          {pickupOnLiveCard && pickupRider ? (
            <RiderAssignmentHorizontalTimeline rider={pickupRider} />
          ) : null}
        </View>
      ) : null}

      {!showLiveAssigned && rider && activeInactive ? (
        <CancelledRiderRow
          rider={rider}
          reachedAt={riderReachedAt}
          orderStage={orderStage}
          allowCall={allowCall}
        />
      ) : null}

      {showSeparatePickupCard && pickupRider ? (
        <View style={showLiveAssigned || (rider && activeInactive) ? styles.stackGap : undefined}>
          <PickupRecordRow rider={pickupRider} allowCall={allowCall} />
        </View>
      ) : null}

      {showAllRidersButton ? (
        <Pressable
          onPress={() => setLogOpen(true)}
          style={({ pressed }) => [styles.allRidersBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="View all riders"
        >
          <Ionicons name="people-outline" size={16} color={GatiMitraMerchant.primary} />
          <Text style={styles.allRidersBtnText}>View all riders</Text>
          <Text style={styles.allRidersCount}>{allRiders.length}</Text>
        </Pressable>
      ) : null}

      <OrderRiderLogSheet
        visible={logOpen}
        riders={allRiders}
        pickupRiderId={pickupRider?.rider_id ?? null}
        allowCall={allowCall}
        onClose={() => setLogOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  fulfillmentHeading: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  selfPickupCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  selfPickupIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  selfPickupBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: 2,
  },
  selfPickupTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 18,
  },
  selfPickupSub: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
    lineHeight: 16,
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
  headingAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
    flexShrink: 0,
    maxWidth: "58%",
  },
  headingAllBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  allRidersBtn: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
    paddingHorizontal: 12,
  },
  allRidersBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
  allRidersCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#CCFBF1",
    fontSize: 11,
    fontWeight: "800",
    color: GatiMitraMerchant.primary,
    textAlign: "center",
  },
  stackGap: {
    marginTop: 10,
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
  cardPickup: {
    borderColor: "#A7F3D0",
    backgroundColor: "#F0FDF4",
  },
  pickupBadge: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pickupBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
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
