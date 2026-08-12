import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { AppAssetImage } from "@/components/AppAssetImage";
import { GatiMitraMerchant } from "@/constants/theme";
import {
  type OrderStageEmptyKey,
  orderStageEmptyAssetKey,
} from "@/lib/orderStageAssets";
import { reloadMerchantAppAssets } from "@/store/appAssetsStore";

const STAGE_LABELS: Record<OrderStageEmptyKey, string> = {
  preparing: "Preparing",
  ready: "Ready",
  picked_up: "Picked Up",
  completed: "Completed",
  rto: "RTO",
  scheduled: "Scheduled",
};

export function OrdersStageEmptyState({
  stage,
  message,
}: {
  stage: OrderStageEmptyKey;
  message?: string;
}) {
  const assetKey = orderStageEmptyAssetKey(stage);
  const label = STAGE_LABELS[stage];

  useFocusEffect(
    useCallback(() => {
      void reloadMerchantAppAssets();
    }, [])
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.imageFrame}>
        <AppAssetImage
          assetKey={assetKey}
          style={styles.image}
          resizeMode="contain"
          accessibilityLabel={message ?? `No ${label.toLowerCase()} orders`}
        />
      </View>
      <Text style={styles.text}>
        {message ?? `No ${label.toLowerCase()} orders right now`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    minHeight: 360,
    backgroundColor: "transparent",
  },
  imageFrame: {
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  image: {
    width: 268,
    height: 268,
    backgroundColor: "transparent",
  },
  text: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingHorizontal: 8,
  },
});
