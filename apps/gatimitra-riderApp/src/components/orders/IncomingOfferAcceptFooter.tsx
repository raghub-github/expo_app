import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { RiderActionSlider } from "@/src/components/orders/RiderActionSlider";
import {
  formatRiderAcceptCountdown,
  riderAcceptSecondsLeft,
  riderAcceptTimeProgress,
} from "@/src/lib/riderOrderAcceptWindow";
import { beginAcceptLatency } from "@/src/lib/acceptOrderLatency";

const URGENT_SECONDS = 20;

type OfferClockOrder = {
  id: string;
  acceptDeadlineAt?: string;
  offerShownAtMs?: number;
  createdAt: string;
};

type Props = {
  order: OfferClockOrder;
  visible: boolean;
  loading: boolean;
  loadingLabel?: string | null;
  acceptLabel: string;
  resetKey: number;
  paddingBottom: number;
  onAccept: () => void;
  onExpired?: () => void;
};

/**
 * Owns the accept countdown tick so the offer body / map do not re-render every 250ms.
 */
export const IncomingOfferAcceptFooter = memo(function IncomingOfferAcceptFooter({
  order,
  visible,
  loading,
  loadingLabel,
  acceptLabel,
  resetKey,
  paddingBottom,
  onAccept,
  onExpired,
}: Props) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    if (visible) visibleSinceRef.current = Date.now();
    else visibleSinceRef.current = null;
  }, [visible, order.id]);

  const secondsLeft = useMemo(() => riderAcceptSecondsLeft(order), [order, nowTick]);
  const mmss = useMemo(() => formatRiderAcceptCountdown(secondsLeft), [secondsLeft]);
  const fuseUrgent = secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

  useEffect(() => {
    if (!visible || secondsLeft > 0 || loading) return;
    const shownAt = visibleSinceRef.current;
    if (shownAt != null && Date.now() - shownAt < 600) return;
    onExpired?.();
  }, [visible, secondsLeft, loading, onExpired]);

  return (
    <View style={[styles.footer, { paddingBottom }]}>
      <RiderActionSlider
        label={loading ? loadingLabel || "Accepting..." : `${acceptLabel} (${mmss})`}
        onComplete={() => {
          beginAcceptLatency(`slide:${Date.now()}`);
          onAccept();
        }}
        loading={loading}
        busyLabel={loadingLabel || "Accepting..."}
        disabled={secondsLeft <= 0}
        resetKey={`${order.id}:${resetKey}`}
        actionName="accept_offer"
        variant={fuseUrgent ? "urgent" : "default"}
        sideInset={12}
        hapticOnComplete
      />
    </View>
  );
});

const styles = StyleSheet.create({
  footer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
});
