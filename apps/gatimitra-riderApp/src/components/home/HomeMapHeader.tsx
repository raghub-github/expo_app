// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { DutyToggle } from "@/src/components/DutyToggle";
import { RiderServiceTypeDropdown } from "@/src/components/header/RiderServiceTypeDropdown";
import { HeaderTrailingActions } from "@/src/components/header/HeaderTrailingActions";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { useNotificationInboxStore } from "@/src/stores/notificationInboxStore";

export const ORDERS_HEADER_BG = "#F5F7FA";

export function HomeMapHeaderInner() {
  const headerRef = useRef<View>(null);
  const [showLangSheet, setShowLangSheet] = useState(false);
  const unreadNotifications = useNotificationInboxStore((s) =>
    s.items.filter((n) => !n.read).length,
  );

  return (
    <>
      <SafeAreaView edges={["top"]} style={styles.safe} collapsable={false}>
        <View ref={headerRef} style={styles.shell} collapsable={false}>
          <View style={styles.leftGroup}>
            <DutyToggle variant="pill" />
            <RiderServiceTypeDropdown headerAnchorRef={headerRef} />
          </View>

          <HeaderTrailingActions
            onLanguagePress={() => setShowLangSheet(true)}
            onNotificationPress={() => router.push("/notifications")}
            notificationBadgeCount={unreadNotifications}
          />
        </View>
      </SafeAreaView>

      <LanguageSelectionSheet
        visible={showLangSheet}
        onClose={() => setShowLangSheet(false)}
      />
    </>
  );
}

export const HomeMapHeader = React.memo(HomeMapHeaderInner);

const styles = StyleSheet.create({
  safe: {
    backgroundColor: ORDERS_HEADER_BG,
    width: "100%",
    zIndex: 20,
  },
  shell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: ORDERS_HEADER_BG,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    minHeight: 52,
    width: "100%",
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    flexGrow: 1,
    gap: 8,
    minWidth: 0,
    paddingRight: 8,
  },
});
