import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { HeaderLanguageIcon, HeaderNotificationIcon } from "./HeaderActionIcons";
import { colors } from "@/src/theme";
import { HEADER_ICON_SIZE } from "@/src/theme/headerFonts";

const ACTION_ICON_SIZE = HEADER_ICON_SIZE;

type HeaderActionIconGroupProps = {
  onLanguagePress: () => void;
  onNotificationPress: () => void;
  notificationBadgeCount?: number;
};

/** Language + notification in one bordered box (reference header) */
export function HeaderActionIconGroup({
  onLanguagePress,
  onNotificationPress,
  notificationBadgeCount = 0,
}: HeaderActionIconGroupProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.group}>
      <Pressable
        onPress={onLanguagePress}
        style={({ pressed }) => [styles.iconTap, pressed && styles.iconTapPressed]}
        accessibilityLabel={t("topbar.selectLanguage", "Select language")}
        accessibilityRole="button"
        hitSlop={6}
      >
        <HeaderLanguageIcon size={ACTION_ICON_SIZE} color={colors.gray[800]} />
      </Pressable>

      <Pressable
        onPress={onNotificationPress}
        style={({ pressed }) => [styles.iconTap, pressed && styles.iconTapPressed]}
        accessibilityLabel={t("topbar.notifications", "Notifications")}
        accessibilityRole="button"
        hitSlop={6}
      >
        <HeaderNotificationIcon
          size={ACTION_ICON_SIZE}
          color={colors.gray[800]}
          showBadge={notificationBadgeCount > 0}
          badgeCount={notificationBadgeCount}
        />
      </Pressable>
    </View>
  );
}

/** Aligned with tab title + icon badge row height */
const GROUP_HEIGHT = 36;

const BORDER = "rgba(148, 163, 184, 0.22)";

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    height: GROUP_HEIGHT,
    minWidth: 84,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    overflow: "visible",
  },
  iconTap: {
    width: 28,
    height: GROUP_HEIGHT - 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
  },
  iconTapPressed: {
    backgroundColor: "#F3F4F6",
  },
});
