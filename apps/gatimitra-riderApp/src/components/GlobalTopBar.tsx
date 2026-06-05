import React, { useState } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { HeaderActionIconGroup } from "@/src/components/header/HeaderActionIconGroup";
import { TabHeaderBrand } from "@/src/components/header/TabHeaderBrand";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { useNotificationInboxStore } from "@/src/stores/notificationInboxStore";
import { useTabHeaderConfig } from "@/src/hooks/useTabHeaderTitle";

export function GlobalTopBar() {
  const [showLangSheet, setShowLangSheet] = useState(false);
  const tabConfig = useTabHeaderConfig();
  const unreadNotifications = useNotificationInboxStore((s) =>
    s.items.filter((n) => !n.read).length,
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safe}>
      <View style={styles.bar}>
        {tabConfig ? <TabHeaderBrand config={tabConfig} /> : <View style={styles.leadingSpacer} />}

        <HeaderActionIconGroup
          onLanguagePress={() => setShowLangSheet(true)}
          onNotificationPress={() => router.push("/notifications")}
          notificationBadgeCount={unreadNotifications}
        />
      </View>

      <LanguageSelectionSheet
        visible={showLangSheet}
        onClose={() => setShowLangSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
  },
  leadingSpacer: {
    flex: 1,
  },
});
