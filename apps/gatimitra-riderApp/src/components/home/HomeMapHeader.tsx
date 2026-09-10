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
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";

export const ORDERS_HEADER_BG = "#F5F7FA";

export function HomeMapHeaderInner() {
  const headerRef = useRef<View>(null);
  const [showLangSheet, setShowLangSheet] = useState(false);
  const unreadNotifications = useNotificationInboxStore((s) =>
    s.items.filter((n) => !n.read).length,
  );
  const { rs, width, layoutFontScale, isCompactWidth } = useResponsiveLayout();
  /** High display zoom / narrow width — header chips must shrink and not collide. */
  const tightHeader = isCompactWidth || width < 380 || layoutFontScale > 1.12;

  return (
    <>
      <SafeAreaView edges={["top"]} style={styles.safe} collapsable={false}>
        <View
          ref={headerRef}
          style={[
            styles.shell,
            {
              paddingHorizontal: rs(tightHeader ? 8 : 12),
              paddingTop: rs(6),
              paddingBottom: rs(8),
              gap: tightHeader ? 4 : 8,
              minHeight: 52,
            },
          ]}
          collapsable={false}
        >
          <View
            style={[
              styles.leftGroup,
              { gap: tightHeader ? 4 : 8, paddingRight: rs(4) },
            ]}
          >
            <DutyToggle variant="pill" compactLabels={tightHeader} />
            <View style={styles.servicesSlot}>
              <RiderServiceTypeDropdown
                headerAnchorRef={headerRef}
                compact={tightHeader}
              />
            </View>
          </View>

          <HeaderTrailingActions
            onLanguagePress={() => setShowLangSheet(true)}
            onNotificationPress={() => router.push("/notifications")}
            notificationBadgeCount={unreadNotifications}
            compact={tightHeader}
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
    width: "100%",
    overflow: "hidden",
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  servicesSlot: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "100%",
  },
});
