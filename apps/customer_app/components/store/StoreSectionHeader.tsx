import React, { useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

export type StoreSectionHeaderProps = {
  title: string;
  subtitle?: string;
  couponLink?: boolean;
  onCouponPress?: () => void;
  defaultExpanded?: boolean;
};

export function StoreSectionHeader({
  title,
  subtitle,
  couponLink,
  onCouponPress,
  defaultExpanded = true,
}: StoreSectionHeaderProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const dark = useMerchantUiDark();

  return (
    <View style={[styles.wrap, dark && styles.wrapDark]}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
      >
        <View style={styles.textBlock}>
          <AppText style={[styles.title, dark && styles.titleDark]}>{title}</AppText>
          {couponLink ? (
            <TouchableOpacity onPress={onCouponPress} hitSlop={8} activeOpacity={0.75}>
              <AppText style={[styles.couponLink, dark && styles.subtitleDark]}>View coupon details</AppText>
              <View style={[styles.couponUnderline, dark && styles.couponUnderlineDark]} />
            </TouchableOpacity>
          ) : subtitle ? (
            <AppText style={[styles.subtitle, dark && styles.subtitleDark]}>{subtitle}</AppText>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={dark ? MerchantDarkPalette.text : StoreTheme.textPrimary}
        />
      </TouchableOpacity>
      <View style={[styles.divider, dark && styles.dividerDark]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  wrapDark: {
    backgroundColor: MerchantDarkPalette.bg,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 12,
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 22,
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  subtitle: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
  },
  subtitleDark: {
    color: MerchantDarkPalette.textMuted,
  },
  couponLink: {
    fontSize: 12,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    alignSelf: "flex-start",
  },
  couponUnderline: {
    marginTop: 2,
    height: 1,
    width: 118,
    borderStyle: "dotted",
    borderBottomWidth: 1,
    borderColor: StoreTheme.textMuted,
  },
  couponUnderlineDark: {
    borderColor: MerchantDarkPalette.border,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: StoreTheme.border,
  },
  dividerDark: {
    backgroundColor: MerchantDarkPalette.border,
  },
});
