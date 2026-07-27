/**
 * Rider notifications — backend campaign + lifecycle inbox
 * (GET /v1/notifications/inbox). Also mirrors foreground local adds when present.
 */
import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { InboxScreen, type InboxItem, type NotificationApiConfig } from "@gatimitra/expo-push-kit";
import { router } from "expo-router";
import { getConfig } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import { colors } from "@/src/theme";

const BG_GRADIENT = ["#E6F7F4", "#F5FBFF", "#FFF5F7"] as const;

export function NotificationsScreen() {
  const apiConfig = useMemo<NotificationApiConfig>(
    () => ({
      baseUrl: getConfig().apiBaseUrl,
      getAuthHeader: async () => {
        const token = useSessionStore.getState().session?.accessToken;
        return token ? `Bearer ${token}` : null;
      },
    }),
    []
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[...BG_GRADIENT]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <InboxScreen
          apiConfig={apiConfig}
          accentColor={colors.primary[600]}
          emptyText="No notifications yet."
          onOpenDeepLink={(deepLink: string, _item: InboxItem) => {
            try {
              if (deepLink.startsWith("http")) return;
              router.push(deepLink as never);
            } catch {
              /* ignore */
            }
          }}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_GRADIENT[0] },
  safe: { flex: 1 },
});
