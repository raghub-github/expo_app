// @refresh reset
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { PROFILE_CARD_RADIUS } from "@/src/components/profile/ProfilePromoCard";
import { profileCardShadow } from "@/src/components/profile/profileCardShadow";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type ProfileListRow = {
  key: string;
  icon: IoniconName;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  subtitleTone?: "default" | "success" | "warning";
  onPress?: () => void;
  disabled?: boolean;
};

export type ProfileListCardProps = {
  headerIcon: IoniconName;
  headerIconColor: string;
  headerIconBg: string;
  title: string;
  subtitle: string;
  rows: ProfileListRow[];
};

function ProfileListRowItem({ row }: { row: ProfileListRow }) {
  const isDisabled = row.disabled === true;
  const subtitleStyles = [
    styles.rowSubtitle,
    row.subtitleTone === "success" ? styles.rowSubtitleSuccess : null,
    row.subtitleTone === "warning" ? styles.rowSubtitleWarning : null,
    isDisabled ? styles.rowSubtitleDisabled : null,
  ];

  return (
    <Pressable
      onPress={row.onPress}
      disabled={!row.onPress || isDisabled}
      style={({ pressed }) => [
        styles.rowPressable,
        row.onPress && !isDisabled && pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={styles.rowInner}>
        <View
          style={[
            styles.rowIconWrap,
            { backgroundColor: row.iconBg },
            isDisabled ? styles.rowIconWrapDisabled : null,
          ]}
        >
          <Ionicons
            name={row.icon}
            size={18}
            color={isDisabled ? "#9CA3AF" : row.iconColor}
          />
        </View>
        <View style={styles.rowCopy}>
          <Text style={[styles.rowTitle, isDisabled ? styles.rowTitleDisabled : null]} numberOfLines={1}>
            {row.title}
          </Text>
          <Text style={subtitleStyles} numberOfLines={2}>
            {row.subtitle}
          </Text>
        </View>
        {row.onPress && !isDisabled ? (
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </View>
        ) : isDisabled ? (
          <View style={styles.chevronWrap}>
            <Ionicons name="lock-closed-outline" size={16} color="#9CA3AF" />
          </View>
        ) : (
          <View style={styles.chevronSpacer} />
        )}
      </View>
    </Pressable>
  );
}

export function ProfileListCard({
  headerIcon,
  headerIconColor,
  headerIconBg,
  title,
  subtitle,
  rows,
}: ProfileListCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerInner}>
        <View style={[styles.headerIconWrap, { backgroundColor: headerIconBg }]}>
          <Ionicons name={headerIcon} size={20} color={headerIconColor} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
      </View>

      {rows.map((row, index) => (
        <View key={row.key} style={styles.rowBlock}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <ProfileListRowItem row={row} />
        </View>
      ))}
    </View>
  );
}

const ICON_SIZE = 40;
const ROW_HPAD = 16;

const styles = StyleSheet.create({
  card: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: PROFILE_CARD_RADIUS,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    ...profileCardShadow,
  },
  headerInner: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: ROW_HPAD,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerIconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 22,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 18,
  },
  rowBlock: {
    width: "100%",
    alignSelf: "stretch",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
    marginLeft: ROW_HPAD + ICON_SIZE + 12,
  },
  rowPressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  rowPressed: {
    backgroundColor: "#F9FAFB",
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: ROW_HPAD,
    paddingVertical: 14,
  },
  rowIconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 20,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "400",
    color: "#6B7280",
    lineHeight: 18,
  },
  rowSubtitleDisabled: {
    color: "#9CA3AF",
  },
  rowTitleDisabled: {
    color: "#9CA3AF",
  },
  rowIconWrapDisabled: {
    backgroundColor: "#F3F4F6",
  },
  rowSubtitleSuccess: {
    color: "#059669",
    fontWeight: "500",
  },
  rowSubtitleWarning: {
    color: "#D97706",
    fontWeight: "500",
  },
  chevronWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chevronSpacer: {
    width: 24,
    flexShrink: 0,
  },
});
