import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { OrderRecord } from "@/hooks/useOrders";
import { callRider } from "@/lib/orderCardActions";
import {
  canTrackAssignedRider,
  orderHasAssignedRider,
} from "@/lib/orderAssignedRider";
import {
  formatRiderStoreWaitLabel,
  resolveRiderCardVariant,
  riderStatusHeadline,
  riderStatusSubline,
} from "@/lib/riderMerchantArrivalDisplay";
import { useLiveElapsedSeconds } from "@/hooks/useLiveElapsedSeconds";
import { useMerchantRiderLiveEnrichment } from "@/hooks/useMerchantRiderLiveEnrichment";
import { MerchantRiderTrackingSheet } from "@/components/order/MerchantRiderTrackingSheet";
import { RiderSelfieAvatar } from "@/components/order/RiderSelfieAvatar";
import { RiderSelfieViewerModal } from "@/components/order/RiderSelfieViewerModal";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  order: OrderRecord;
  showCall?: boolean;
  showTrack?: boolean;
};

export function MerchantAssignedRiderRow({
  order,
  showCall = true,
  showTrack = true,
}: Props) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [selfieModalOpen, setSelfieModalOpen] = useState(false);

  const hasRider = orderHasAssignedRider(order);
  const enrichment = useMerchantRiderLiveEnrichment(order, storeId, token, hasRider);
  const variant = hasRider ? resolveRiderCardVariant(order) : "on_the_way";
  const waitSeconds = useLiveElapsedSeconds(
    order.riderStoreWaitAnchorAt ?? order.reachedMerchantAt ?? order.riderReachedAt,
    hasRider && variant === "arrived" && order.riderStoreWaitLive === true
  );

  if (!hasRider) return null;

  const riderName = enrichment.riderName;
  const storeWaitLabel =
    variant === "arrived"
      ? formatRiderStoreWaitLabel(
          order.riderStoreWaitLive ? waitSeconds : order.pickupWaitSeconds,
          { live: order.riderStoreWaitLive === true }
        )
      : null;
  const headline = riderStatusHeadline(variant, riderName);
  const subline = riderStatusSubline(
    variant,
    riderName,
    enrichment.arrivalSubtitle,
    storeWaitLabel
  );
  const mobile = (enrichment.riderMobile ?? order.riderMobile ?? "").trim() || null;
  const isOutForDelivery = variant === "picked_up";
  const trackEnabled = showTrack && canTrackAssignedRider(order);
  const showCallBtn = showCall && !!mobile;
  const showActions = !isOutForDelivery && (trackEnabled || showCallBtn);

  return (
    <>
      <View style={[styles.wrap, isOutForDelivery && styles.wrapCompact]}>
        <View style={[styles.headerRow, isOutForDelivery && styles.headerRowCompact]}>
          <RiderSelfieAvatar
            selfieUrl={enrichment.riderSelfieUrl}
            riderName={riderName}
            size={isOutForDelivery ? 44 : 48}
            onPress={() => setSelfieModalOpen(true)}
          />

          <View style={[styles.body, isOutForDelivery && styles.bodyCompact]}>
            {!isOutForDelivery ? (
              <Text style={styles.sectionLabel}>Delivery partner</Text>
            ) : null}
            <Text
              style={[styles.headline, isOutForDelivery && styles.headlineCompact]}
              numberOfLines={isOutForDelivery ? 1 : 2}
            >
              {headline}
            </Text>
            {!isOutForDelivery && subline ? (
              <Text style={styles.subline} numberOfLines={2}>
                {subline}
              </Text>
            ) : null}
          </View>

          {isOutForDelivery && showCallBtn ? (
            <Pressable
              onPress={() => {
                if (mobile) void callRider(mobile);
              }}
              style={({ pressed }) => [styles.callIconBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={`Call ${riderName}`}
            >
              <Ionicons name="call" size={18} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          ) : null}
        </View>

        {showActions ? (
          <View style={styles.actionsRow}>
            {trackEnabled ? (
              <Pressable
                onPress={() => setTrackingOpen(true)}
                style={({ pressed }) => [styles.trackBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Track ${riderName}`}
              >
                <Ionicons name="location-outline" size={15} color={GatiMitraMerchant.navy} />
                <Text style={styles.trackText}>Track live</Text>
              </Pressable>
            ) : null}
            {showCallBtn ? (
              <Pressable
                onPress={() => {
                  if (mobile) void callRider(mobile);
                }}
                disabled={!mobile}
                style={({ pressed }) => [
                  styles.callBtn,
                  trackEnabled ? undefined : styles.callBtnFull,
                  !mobile && styles.callBtnDisabled,
                  pressed && mobile && styles.pressed,
                ]}
                accessibilityLabel={`Call ${riderName}`}
              >
                <Ionicons name="call-outline" size={15} color={GatiMitraMerchant.textPrimary} />
                <Text style={styles.callText}>Call</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {trackEnabled && token && storeId && !order.id.startsWith("core-") ? (
        <MerchantRiderTrackingSheet
          visible={trackingOpen}
          onClose={() => setTrackingOpen(false)}
          order={order}
          storeId={storeId}
          token={token}
          enrichment={enrichment}
        />
      ) : null}

      <RiderSelfieViewerModal
        visible={selfieModalOpen}
        imageUrl={enrichment.riderSelfieUrl}
        riderName={riderName}
        onClose={() => setSelfieModalOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: GatiMitraMerchant.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  wrapCompact: {
    paddingVertical: 10,
    gap: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerRowCompact: {
    alignItems: "center",
    gap: 10,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bodyCompact: {
    justifyContent: "center",
    gap: 0,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  headlineCompact: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  subline: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.primaryDark,
    lineHeight: 17,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  trackBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
  },
  trackText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
  },
  callBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  callBtnFull: {
    flex: 1,
  },
  callBtnDisabled: {
    opacity: 0.45,
  },
  callText: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  callIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pressed: { opacity: 0.88 },
});
