import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SubscriptionBottomSheet } from "@/src/components/subscription/SubscriptionBottomSheet";
import {
  pickFeaturedPlan,
  useRiderSubscriptionPlans,
  useRiderSubscriptionStatus,
} from "@/src/hooks/useRiderSubscription";
import { useRiderVehicle } from "@/src/hooks/useRiderVehicle";

/**
 * Shows GMitra Max subscription sheet on app open when rider has NO active subscription.
 */
export function RiderSubscriptionPrompt() {
  const { data: plans = [], isFetched: plansFetched } = useRiderSubscriptionPlans();
  const { data: status, isFetched: statusFetched, isError: statusError } = useRiderSubscriptionStatus();
  const { data: vehicleStatus, isFetched: vehicleFetched } = useRiderVehicle();
  const [visible, setVisible] = useState(false);
  const [sessionDismissed, setSessionDismissed] = useState(false);

  const featured = pickFeaturedPlan(plans);
  const isSubscribed = !statusError && Boolean(status?.active);
  const vehicleGatePending = vehicleFetched && !vehicleStatus?.isComplete;
  const ready = plansFetched && statusFetched && vehicleFetched;
  const shouldOffer =
    ready && Boolean(featured) && !isSubscribed && !sessionDismissed && !vehicleGatePending;

  useEffect(() => {
    if (!shouldOffer) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 500);
    return () => clearTimeout(timer);
  }, [shouldOffer, featured?.id]);

  if (!featured || isSubscribed) return null;

  return (
    <View style={styles.host} pointerEvents="box-none">
      <SubscriptionBottomSheet
        visible={visible}
        onClose={() => {
          setVisible(false);
          setSessionDismissed(true);
        }}
        plan={featured}
        onSubscribed={() => {
          setVisible(false);
          setSessionDismissed(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
});
