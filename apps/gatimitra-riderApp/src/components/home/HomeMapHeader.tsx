import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { DutyToggle } from "@/src/components/DutyToggle";
import { HeaderTrailingActions } from "@/src/components/header/HeaderTrailingActions";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { useNotificationInboxStore } from "@/src/stores/notificationInboxStore";

export function HomeMapHeader() {
  const [showLangSheet, setShowLangSheet] = useState(false);
  const unreadNotifications = useNotificationInboxStore((s) =>
    s.items.filter((n) => !n.read).length,
  );

  return (
    <>
      <View style={styles.headerShell}>
        <View style={styles.headerRow}>
          <DutyToggle variant="pill" />

          <HeaderTrailingActions
            onLanguagePress={() => setShowLangSheet(true)}
            onNotificationPress={() => router.push("/notifications")}
            notificationBadgeCount={unreadNotifications}
          />
        </View>
      </View>

      <LanguageSelectionSheet
        visible={showLangSheet}
        onClose={() => setShowLangSheet(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});
