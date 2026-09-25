/**
 * Single tab chrome shell for every tab. Safe-area + bar height never remount
 * when switching Orders ↔ other tabs (that remount was the header jump).
 */
import React, { useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { DutyToggle } from "@/src/components/DutyToggle";
import { RiderServiceTypeDropdown } from "@/src/components/header/RiderServiceTypeDropdown";
import { HeaderTrailingActions } from "@/src/components/header/HeaderTrailingActions";
import { TabHeaderBrand } from "@/src/components/header/TabHeaderBrand";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { useRiderInboxUnreadStore } from "@/src/stores/riderInboxUnreadStore";
import { useTabHeaderConfig } from "@/src/hooks/useTabHeaderTitle";
import { ORDERS_HEADER_BG } from "@/src/components/home/HomeMapHeader";
import { HEADER_EDGE_INSET } from "@/src/theme/headerFonts";

/** Matches GlobalTopBar / Orders row — keep identical so tab switches don't reflow. */
export const TAB_CHROME_BAR_HEIGHT = 56;

type Props = {
  onOrdersHome: boolean;
};

/**
 * Android status bar is opaque (edge-to-edge off), so the window already
 * starts below it. Adding StatusBar.currentHeight on top of that inset
 * leaves a blank band. Use only the inset reported inside the window.
 */
function useStableTopInset(): number {
  const insets = useSafeAreaInsets();
  const stable = useRef(insets.top);
  if (insets.top > stable.current) {
    stable.current = insets.top;
  }
  return stable.current;
}

export function TabAppChrome({ onOrdersHome }: Props) {
  const topInset = useStableTopInset();
  const headerRef = useRef<View>(null);
  const [showLangSheet, setShowLangSheet] = useState(false);
  const tabConfig = useTabHeaderConfig();
  const unreadNotifications = useRiderInboxUnreadStore((s) => s.unread);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[
          styles.shell,
          {
            paddingTop: topInset,
            backgroundColor: onOrdersHome ? ORDERS_HEADER_BG : "#FFFFFF",
            borderBottomWidth: onOrdersHome ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
        collapsable={false}
      >
        <View
          ref={headerRef}
          style={styles.bar}
          collapsable={false}
          pointerEvents="box-none"
        >
          {onOrdersHome ? (
            <>
              <View style={styles.dutySlot}>
                <DutyToggle variant="pill" />
              </View>
              <View style={styles.servicesSlot}>
                <RiderServiceTypeDropdown headerAnchorRef={headerRef} />
              </View>
            </>
          ) : tabConfig ? (
            <TabHeaderBrand config={tabConfig} />
          ) : (
            <View style={styles.leadingSpacer} pointerEvents="none" />
          )}

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
  shell: {
    width: "100%",
    zIndex: 12000,
    elevation: 0,
    borderBottomColor: "#E2E8F0",
  },
  bar: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    justifyContent: "flex-start",
    height: TAB_CHROME_BAR_HEIGHT,
    paddingLeft: HEADER_EDGE_INSET,
    paddingRight: HEADER_EDGE_INSET,
    width: "100%",
    gap: 8,
    overflow: "hidden",
  },
  dutySlot: {
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  servicesSlot: {
    height: 36,
    justifyContent: "center",
    alignItems: "flex-start",
    flexShrink: 1,
    flexGrow: 0,
    minWidth: 0,
  },
  leadingSpacer: {
    flex: 1,
  },
});
