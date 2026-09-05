import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import type { FoodOrderRiderLogEntry } from "@/services/ordersApi";
import { isInactiveRiderAssignment } from "@/lib/orderAssignedRider";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { RiderAssignmentHorizontalTimeline } from "@/components/order/RiderAssignmentHorizontalTimeline";
import { GatiMitraMerchant, CARD_RADIUS, CARD_PADDING } from "@/constants/theme";

type Props = {
  visible: boolean;
  riders: FoodOrderRiderLogEntry[];
  onClose: () => void;
  pickupRiderId?: number | null;
  allowCall?: boolean;
};

function HistoryRiderRow({
  rider,
  isPickup,
  allowCall,
}: {
  rider: FoodOrderRiderLogEntry;
  isPickup: boolean;
  allowCall: boolean;
}) {
  const [selfieOpen, setSelfieOpen] = useState(false);
  const inactive = isInactiveRiderAssignment(
    rider.assignment_status,
    rider.cancelled_at,
    rider.rejected_at
  );
  const name = (rider.rider_name ?? "").trim() || "Delivery partner";
  const mobile = (rider.rider_mobile ?? "").trim();

  return (
    <View style={[styles.card, inactive ? styles.cardMuted : isPickup ? styles.cardPickup : null]}>
      <View style={styles.row}>
        <RiderSelfieAvatar
          selfieUrl={rider.selfie_url}
          riderName={name}
          size={44}
          onPress={() => setSelfieOpen(true)}
        />
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {isPickup ? (
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

      {inactive && !isPickup && !rider.picked_up_at?.trim() ? (
        <View style={styles.warnBanner}>
          <Ionicons name="warning-outline" size={14} color="#991B1B" />
          <Text style={styles.warnText}>
            Do not hand over this order to this rider.
          </Text>
        </View>
      ) : null}
      <RiderSelfieViewerModal
        visible={selfieOpen}
        imageUrl={rider.selfie_url ?? null}
        riderName={name}
        onClose={() => setSelfieOpen(false)}
      />
    </View>
  );
}

export function OrderRiderLogSheet({ visible, riders, onClose, pickupRiderId, allowCall = false }: Props) {
  return (
    <MerchantBottomSheetShell visible={visible} onClose={onClose} maxHeightPercent="86%">
      <View style={styles.header}>
        <Text style={styles.title}>All riders</Text>
        <Text style={styles.subtitle}>
          Every delivery partner assigned to this order
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {riders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bicycle-outline" size={36} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No rider assignments yet</Text>
          </View>
        ) : (
          riders.map((r, idx) => (
            <View
              key={`${r.rider_id}-${r.assigned_at ?? r.cancelled_at ?? idx}`}
              style={idx > 0 ? styles.gap : null}
            >
              <HistoryRiderRow
                rider={r}
                allowCall={allowCall}
                isPickup={
                  Boolean(r.picked_up_at?.trim()) &&
                  (pickupRiderId == null || Number(r.rider_id) === Number(pickupRiderId))
                }
              />
            </View>
          ))
        )}
      </ScrollView>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  gap: { marginTop: 10 },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
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
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pickupBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  warnBanner: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  warnText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#991B1B",
    lineHeight: 16,
    textAlign: "center",
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
