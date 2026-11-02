import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { RiderActionSlider } from "@/src/components/orders/RiderActionSlider";
import {
  formatRiderAcceptCountdown,
  riderAcceptSecondsLeft,
} from "@/src/lib/riderOrderAcceptWindow";
import { beginAcceptLatency } from "@/src/lib/acceptOrderLatency";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

const URGENT_SECONDS = 20;

/**
 * Last-resort backstop. `loading` rightly suppresses expiry while an accept is
 * genuinely in flight, but it must not do so forever: a stuck accept used to
 * pin the offer open permanently, with a dead slider and no way out. The host's
 * accept watchdog should resolve long before this fires.
 */
const STUCK_LOADING_EXPIRY_MS = 30_000;

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
 * Owns the accept countdown tick so the offer body / map do not re-render every second.
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
  const { rs, isCompactWidth } = useResponsiveLayout();
  const [nowTick, setNowTick] = useState(() => Date.now());
  const visibleSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    // Countdown is whole seconds — 250ms woke the JS thread 4× harder than needed.
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  useEffect(() => {
    if (visible) visibleSinceRef.current = Date.now();
    else visibleSinceRef.current = null;
  }, [visible, order.id]);

  const loadingSinceRef = useRef<number | null>(null);
  useEffect(() => {
    loadingSinceRef.current = loading ? Date.now() : null;
  }, [loading, order.id]);

  const secondsLeft = useMemo(() => riderAcceptSecondsLeft(order), [order, nowTick]);
  const mmss = useMemo(() => formatRiderAcceptCountdown(secondsLeft), [secondsLeft]);
  const fuseUrgent = secondsLeft > 0 && secondsLeft <= URGENT_SECONDS;

  // Stable identity: an inline arrow here re-rendered the memoised slider on
  // every countdown tick, competing with the drag on the JS thread.
  const handleComplete = useCallback(() => {
    beginAcceptLatency(`slide:${Date.now()}`);
    onAccept();
  }, [onAccept]);

  useEffect(() => {
    if (!visible || secondsLeft > 0) return;
    if (loading) {
      const busySince = loadingSinceRef.current;
      if (busySince == null || Date.now() - busySince < STUCK_LOADING_EXPIRY_MS) return;
    }
    const shownAt = visibleSinceRef.current;
    if (shownAt != null && Date.now() - shownAt < 600) return;
    onExpired?.();
  }, [visible, secondsLeft, loading, nowTick, onExpired]);

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom,
          paddingHorizontal: rs(isCompactWidth ? 12 : 16),
        },
      ]}
    >
      <RiderActionSlider
        label={loading ? loadingLabel || "Accepting..." : `${acceptLabel} (${mmss})`}
        onComplete={handleComplete}
        loading={loading}
        busyLabel={loadingLabel || "Accepting..."}
        disabled={secondsLeft <= 0}
        resetKey={`${order.id}:${resetKey}`}
        actionName="accept_offer"
        variant={fuseUrgent ? "urgent" : "default"}
        sideInset={rs(12)}
        hapticOnComplete
      />
    </View>
  );
});

const styles = StyleSheet.create({
  footer: {
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    flexShrink: 0,
    width: "100%",
    maxWidth: "100%",
  },
});
