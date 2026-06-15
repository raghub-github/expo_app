import React from "react";
import { View, StyleSheet } from "react-native";
import { HeaderActionIconGroup } from "@/src/components/header/HeaderActionIconGroup";
import { HeaderMaxSubscriptionBadge } from "@/src/components/header/HeaderMaxSubscriptionBadge";
import { useRiderSubscriptionStatus } from "@/src/hooks/useRiderSubscription";

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
  const { data: subscriptionStatus } = useRiderSubscriptionStatus();
  const isSubscribed = Boolean(subscriptionStatus?.active);

  return (
    <View style={styles.row}>
      {isSubscribed ? <HeaderMaxSubscriptionBadge /> : null}
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
    gap: 10,
  },
});
