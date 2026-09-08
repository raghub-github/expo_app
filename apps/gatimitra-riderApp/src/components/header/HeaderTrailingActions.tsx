import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { HeaderActionIconGroup } from "@/src/components/header/HeaderActionIconGroup";
import { HeaderMaxSubscriptionBadge } from "@/src/components/header/HeaderMaxSubscriptionBadge";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";
import {
  getCachedRiderSubscriptionStatus,
  hydrateRiderSubscriptionCache,
} from "@/src/lib/rider-subscription-cache";
import { HEADER_MAX_SLOT_WIDTH } from "@/src/theme/headerFonts";

type Props = {
  onLanguagePress: () => void;
  onNotificationPress: () => void;
  notificationBadgeCount?: number;
};

export function HeaderTrailingActions({
  onLanguagePress,
  onNotificationPress,
  notificationBadgeCount = 0,
}: Props) {
  const { data: subscriptionStatus, isFetched } = useRiderSubscriptionStatus();
  const [cacheActive, setCacheActive] = useState(
    () => Boolean(getCachedRiderSubscriptionStatus()?.active),
  );

  useEffect(() => {
    void hydrateRiderSubscriptionCache().then((cached) => {
      setCacheActive(Boolean(cached?.active));
    });
  }, []);

  // Prefer live API; while loading keep cache so MAX does not pop in late.
  const showMax = isFetched
    ? Boolean(subscriptionStatus?.active)
    : Boolean(subscriptionStatus?.active) || cacheActive;

  return (
    <View style={styles.row} pointerEvents="box-none" collapsable={false}>
      <View style={styles.maxSlot} collapsable={false}>
        {showMax ? <HeaderMaxSubscriptionBadge /> : null}
      </View>
      <HeaderActionIconGroup
        onLanguagePress={onLanguagePress}
        onNotificationPress={onNotificationPress}
        notificationBadgeCount={notificationBadgeCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    marginLeft: "auto",
  },
  /** Always reserve MAX width — prevents late subscription fetch from shoving the row. */
  maxSlot: {
    width: HEADER_MAX_SLOT_WIDTH,
    height: 36,
    alignItems: "flex-end",
    justifyContent: "center",
    flexShrink: 0,
  },
});
